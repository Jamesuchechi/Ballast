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
): Promise<{ sameChain: boolean; rootId: string | null }> {
  if (fromId === toId) {
    return { sameChain: true, rootId: fromId };
  }

  const [fromRoot, toRoot] = await Promise.all([
    getRootBriefId(workspaceId, fromId),
    getRootBriefId(workspaceId, toId),
  ]);

  if (fromRoot.rootId === toRoot.rootId) {
    return { sameChain: true, rootId: fromRoot.rootId };
  }

  return { sameChain: false, rootId: null };
}

/**
 * Computes line-by-line diff between two text blocks.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const diff: DiffLine[] = [];

  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diff.push({ type: 'same', text: oldLines[i] });
      i++;
      j++;
    } else if (
      j < newLines.length &&
      (!oldLines.includes(newLines[j], i) || oldLines.indexOf(newLines[j], i) - i > 4)
    ) {
      diff.push({ type: 'add', text: newLines[j] });
      j++;
    } else if (i < oldLines.length) {
      diff.push({ type: 'del', text: oldLines[i] });
      i++;
    } else if (j < newLines.length) {
      diff.push({ type: 'add', text: newLines[j] });
      j++;
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
    versionChainLength: 2,
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

