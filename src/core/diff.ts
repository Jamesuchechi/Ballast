import { diffLines } from 'diff';
import { query, queryOne } from '@/db/client';

export interface DiffLine {
  type: 'add' | 'del' | 'same';
  text: string;
}

export interface SectionDiff {
  title: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

export interface BriefDiffResult {
  fromBrief: {
    id: string;
    question: string;
    mode: string;
    asOf: string;
    status: string;
  };
  toBrief: {
    id: string;
    question: string;
    mode: string;
    asOf: string;
    status: string;
  };
  sharedRootId: string;
  versionChainLength: number;
  stats: {
    totalAdditions: number;
    totalDeletions: number;
    totalUnchanged: number;
  };
  unifiedMarkdownDiff: DiffLine[];
  answerDiff: DiffLine[];
  evidenceClaimDiff: {
    addedClaims: string[];
    removedClaims: string[];
    retainedClaims: string[];
  };
  actionDiff: {
    addedActions: string[];
    removedActions: string[];
  };
}

/**
 * Walks up parent_brief_id recursively to find root brief (FR6.2).
 */
export async function getRootBriefId(
  workspaceId: string,
  briefId: string,
  visited = new Set<string>()
): Promise<{ rootId: string; chain: string[] }> {
  const chain: string[] = [briefId];
  let currentId: string | null = briefId;

  while (currentId) {
    if (visited.has(currentId)) {
      break; // Detect cycles
    }
    visited.add(currentId);

    const row: { parent_brief_id: string | null } | null = await queryOne<{ parent_brief_id: string | null }>(
      `SELECT parent_brief_id FROM briefs WHERE id = $1 AND workspace_id = $2`,
      [currentId, workspaceId]
    );

    if (row && row.parent_brief_id) {
      chain.push(row.parent_brief_id);
      currentId = row.parent_brief_id;
    } else {
      break;
    }
  }

  const rootId = chain[chain.length - 1];
  return { rootId, chain };
}

/**
 * Verifies if two briefs belong to the same parent_brief_id version lineage (FR6.2).
 */
export async function areInSameVersionChain(
  workspaceId: string,
  fromId: string,
  toId: string
): Promise<{
  sameChain: boolean;
  rootId: string | null;
  chainLength: number;
  fromChain: string[];
  toChain: string[];
}> {
  if (fromId === toId) {
    const fromRoot = await getRootBriefId(workspaceId, fromId);
    return {
      sameChain: true,
      rootId: fromId,
      chainLength: 1,
      fromChain: fromRoot.chain,
      toChain: fromRoot.chain,
    };
  }

  const [fromRoot, toRoot] = await Promise.all([
    getRootBriefId(workspaceId, fromId),
    getRootBriefId(workspaceId, toId),
  ]);

  if (fromRoot.rootId !== toRoot.rootId || !fromRoot.rootId) {
    return {
      sameChain: false,
      rootId: null,
      chainLength: 0,
      fromChain: fromRoot.chain,
      toChain: toRoot.chain,
    };
  }

  // Calculate actual version chain distance between fromId and toId
  // fromRoot.chain: [fromId, parent, grandparent, ..., rootId]
  // toRoot.chain: [toId, parent, grandparent, ..., rootId]
  let chainLength = 2;

  const fromIdxInTo = toRoot.chain.indexOf(fromId);
  const toIdxInFrom = fromRoot.chain.indexOf(toId);

  if (fromIdxInTo !== -1) {
    // toId is a descendant of fromId (e.g. fromId=v1 at index 2 in [v3, v2, v1] -> length = 2 + 1 = 3)
    chainLength = fromIdxInTo + 1;
  } else if (toIdxInFrom !== -1) {
    // fromId is a descendant of toId
    chainLength = toIdxInFrom + 1;
  } else {
    // Branching from shared ancestor: find Lowest Common Ancestor (LCA)
    const lca = fromRoot.chain.find((id) => toRoot.chain.includes(id));
    if (lca) {
      const distFrom = fromRoot.chain.indexOf(lca);
      const distTo = toRoot.chain.indexOf(lca);
      chainLength = distFrom + distTo + 1;
    } else {
      chainLength = fromRoot.chain.length + toRoot.chain.length;
    }
  }

  return {
    sameChain: true,
    rootId: fromRoot.rootId,
    chainLength,
    fromChain: fromRoot.chain,
    toChain: toRoot.chain,
  };
}

/**
 * Computes line-by-line diff between two text blocks using the Myers diff algorithm (O(ND)).
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldStr = oldText ?? '';
  const newStr = newText ?? '';

  if (oldStr === '' && newStr === '') {
    return [{ type: 'same', text: '' }];
  }

  const changes = diffLines(oldStr, newStr);
  const diff: DiffLine[] = [];

  for (const change of changes) {
    const type: 'add' | 'del' | 'same' = change.added ? 'add' : change.removed ? 'del' : 'same';
    let val = change.value;
    if (val.endsWith('\r\n')) {
      val = val.slice(0, -2);
    } else if (val.endsWith('\n') || val.endsWith('\r')) {
      val = val.slice(0, -1);
    }
    const lines = val.split(/\r?\n/);
    for (const line of lines) {
      diff.push({ type, text: line });
    }
  }

  return diff;
}

/**
 * Diffs two briefs that share a version chain (FR6.2).
 */
export async function diffBriefsInChain(
  workspaceId: string,
  fromId: string,
  toId: string
): Promise<BriefDiffResult> {
  // 1. Verify same version chain
  const chainCheck = await areInSameVersionChain(workspaceId, fromId, toId);
  if (!chainCheck.sameChain || !chainCheck.rootId) {
    throw new Error(`Briefs ${fromId} and ${toId} do not share the same version chain (FR6.2).`);
  }

  // 2. Load briefs
  const [fromRow, toRow] = await Promise.all([
    queryOne<any>(`SELECT * FROM briefs WHERE id = $1 AND workspace_id = $2`, [fromId, workspaceId]),
    queryOne<any>(`SELECT * FROM briefs WHERE id = $1 AND workspace_id = $2`, [toId, workspaceId]),
  ]);

  if (!fromRow || !toRow) {
    throw new Error('One or both briefs could not be found');
  }

  // 3. Load citations for claims
  const [fromCitations, toCitations] = await Promise.all([
    query<{ quote: string; claim_span: any }>(`SELECT quote, claim_span FROM citations WHERE brief_id = $1`, [fromId]),
    query<{ quote: string; claim_span: any }>(`SELECT quote, claim_span FROM citations WHERE brief_id = $1`, [toId]),
  ]);

  // Extract claim texts
  const fromClaims = fromCitations.map((c) => c.quote.trim()).filter(Boolean);
  const toClaims = toCitations.map((c) => c.quote.trim()).filter(Boolean);

  const addedClaims = toClaims.filter((c) => !fromClaims.includes(c));
  const removedClaims = fromClaims.filter((c) => !toClaims.includes(c));
  const retainedClaims = toClaims.filter((c) => fromClaims.includes(c));

  // 4. Extract actions
  const [fromActions, toActions] = await Promise.all([
    query<{ type: string; payload: any }>(`SELECT type, payload FROM actions WHERE brief_id = $1`, [fromId]),
    query<{ type: string; payload: any }>(`SELECT type, payload FROM actions WHERE brief_id = $1`, [toId]),
  ]);

  const fromActionDescs = fromActions.map((a) => `${a.type}: ${JSON.stringify(a.payload)}`);
  const toActionDescs = toActions.map((a) => `${a.type}: ${JSON.stringify(a.payload)}`);

  const addedActions = toActionDescs.filter((a) => !fromActionDescs.includes(a));
  const removedActions = fromActionDescs.filter((a) => !toActionDescs.includes(a));

  // 5. Compute unified markdown diff & answer diff
  const unifiedMarkdownDiff = computeLineDiff(fromRow.markdown || '', toRow.markdown || '');

  // Extract answer section from markdown
  const extractAnswer = (md: string) => {
    const match = md.match(/## Answer\s*\n([\s\S]*?)(?=\n## |$)/i);
    return match ? match[1].trim() : md.slice(0, 300);
  };
  const answerDiff = computeLineDiff(extractAnswer(fromRow.markdown || ''), extractAnswer(toRow.markdown || ''));

  const totalAdditions = unifiedMarkdownDiff.filter((l) => l.type === 'add').length;
  const totalDeletions = unifiedMarkdownDiff.filter((l) => l.type === 'del').length;
  const totalUnchanged = unifiedMarkdownDiff.filter((l) => l.type === 'same').length;

  return {
    fromBrief: {
      id: fromRow.id,
      question: fromRow.question,
      mode: fromRow.mode,
      asOf: fromRow.as_of,
      status: fromRow.status,
    },
    toBrief: {
      id: toRow.id,
      question: toRow.question,
      mode: toRow.mode,
      asOf: toRow.as_of,
      status: toRow.status,
    },
    sharedRootId: chainCheck.rootId,
    versionChainLength: chainCheck.chainLength,
    stats: {
      totalAdditions,
      totalDeletions,
      totalUnchanged,
    },
    unifiedMarkdownDiff,
    answerDiff,
    evidenceClaimDiff: {
      addedClaims,
      removedClaims,
      retainedClaims,
    },
    actionDiff: {
      addedActions,
      removedActions,
    },
  };
}

export const computeBriefDiff = diffBriefsInChain;

