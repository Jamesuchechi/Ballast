import { query, queryOne } from '@/db/client';
import { retrievePrivateChunks } from './retrieval';
import { runWriter } from './writer';
import { runCritic } from './critic';
import { renderBriefMarkdown } from './renderer';
import { validateForPublish } from './validator';
import { renderAndStorePdf } from './pdfRenderer';
import type {
  BriefV1,
  CitationRecord,
  CriticInput,
  CriticLog,
  PublishedEvidenceItem,
  PublishedBriefSections,
  RetrievedQuote,
  UncheckedConnector,
} from './types';

export interface WorkerProgressEntry {
  step: string;
  timestamp: string;
  message?: string;
  meta?: Record<string, any>;
}

export const CANONICAL_STEPS = [
  'queued',
  'planning',
  'retrieving_private',
  'retrieving_web',
  'drafting',
  'verifying',
  'validating',
  'rendering',
  'proposing_actions',
  'published',
] as const;

/**
 * Appends a step to briefs.progress JSONB column in PostgreSQL
 */
export async function appendProgress(
  briefId: string,
  step: string,
  message?: string,
  meta?: Record<string, any>
): Promise<void> {
  const entry: WorkerProgressEntry = {
    step,
    timestamp: new Date().toISOString(),
    message,
    meta,
  };

  await query(
    `UPDATE briefs 
     SET progress = COALESCE(progress, '[]'::jsonb) || $2::jsonb 
     WHERE id = $1`,
    [briefId, JSON.stringify([entry])]
  );
}

/**
 * Runs the full Phase 2 async generation pipeline for a queued brief
 */
export async function processQueuedBrief(briefId: string): Promise<BriefV1 | null> {
  const startTime = Date.now();

  // 1. Fetch brief
  const briefRow = await queryOne<{
    id: string;
    workspace_id: string;
    parent_brief_id: string | null;
    question: string;
    mode: 'home' | 'world';
    status: string;
  }>(`SELECT * FROM briefs WHERE id = $1`, [briefId]);

  if (!briefRow) {
    throw new Error(`Brief ${briefId} not found`);
  }

  const { workspace_id: workspaceId, question, mode, parent_brief_id: parentBriefId } = briefRow;

  try {
    // Transition to running
    await query(`UPDATE briefs SET status = 'running' WHERE id = $1`, [briefId]);

    // Step: planning
    await appendProgress(briefId, 'planning', 'Analyzing question and planning retrieval passes');

    // Step: retrieving_private
    await appendProgress(briefId, 'retrieving_private', 'Executing vector retrieval over private workspace chunks');
    const retrieval = await retrievePrivateChunks({
      workspaceId,
      queryText: question,
      limit: 8,
      briefId,
    });

    // Step: retrieving_web
    if (mode === 'home') {
      await appendProgress(
        briefId,
        'retrieving_web',
        'Web retrieval disabled in Home mode (FR3.4)'
      );
    } else {
      await appendProgress(briefId, 'retrieving_web', 'Querying web snapshot cache');
    }

    // Step: drafting
    await appendProgress(briefId, 'drafting', 'Drafting brief sections quoting source evidence');
    const draft = await runWriter({
      question,
      mode,
      sources: retrieval.sources,
      retrieved: retrieval.quotes,
    });

    // Check for any unchecked / partially failed connectors in this workspace (FR2.6, NFR4.5)
    const uncheckedList: UncheckedConnector[] = [];
    const connectorErrors = await query<{ connector: string; last_error: string }>(
      `SELECT connector, last_error FROM sources 
       WHERE workspace_id = $1 AND last_error IS NOT NULL 
       GROUP BY connector, last_error`,
      [workspaceId]
    );

    for (const ce of connectorErrors) {
      uncheckedList.push({
        connector: ce.connector,
        error: ce.last_error,
      });
    }

    // Step: verifying (The Critic Gate)
    await appendProgress(briefId, 'verifying', 'Auditing draft assertions against source quotes');
    const criticInput: CriticInput = {
      question,
      mode,
      retrieved: retrieval.quotes,
      draft_brief: draft,
      unchecked: uncheckedList,
    };

    const criticOut = await runCritic({ input: criticInput });

    const criticLog: CriticLog = {
      claims_in: draft.sections.evidence.length,
      claims_kept: criticOut.keep.length,
      claims_dropped: criticOut.drop.length,
      keep: criticOut.keep,
      drop: criticOut.drop,
      conflicts: criticOut.conflicts,
      missing: criticOut.missing,
      did_not: criticOut.did_not,
    };

    // Step: validating (Publish Validator Gate)
    await appendProgress(briefId, 'validating', 'Enforcing publish constraints and heading presence');

    const quoteMap = new Map(retrieval.quotes.map((q) => [q.id, q]));
    const evidenceItems: PublishedEvidenceItem[] = [];

    for (const k of criticOut.keep) {
      const citations: CitationRecord[] = k.citation_ids
        .map((id) => quoteMap.get(id))
        .filter((q): q is RetrievedQuote => q !== undefined)
        .map((q) => ({
          id: q.id,
          source_id: q.source_id,
          source_class: q.source_class,
          citation_type: 'support' as const,
          quote: q.quote,
          url: q.url,
        }));

      evidenceItems.push({
        claim: k.claim,
        citations,
      });
    }

    // Empty evidence path (FR4.9): if keep is empty, publish with empty Answer and filled Uncertain
    const hasEvidence = evidenceItems.length > 0;
    const answerText = hasEvidence
      ? draft.sections.answer
      : 'No citable evidence was found in the indexed corpus to answer this query.\nAsserted claims were withheld to prevent ungrounded hallucinations.';

    const uncertainList = hasEvidence
      ? draft.sections.uncertain
      : [
          ...draft.sections.uncertain,
          'Private corpus does not contain documented statements directly answering the question.',
        ];

    const didNotList = [
      ...draft.sections.what_i_did_not_do,
      'Did not publish ungrounded or unsourced assertions.',
    ];

    const uncheckedBullets = [
      ...draft.sections.what_i_used.unchecked,
      ...uncheckedList.map(
        (u) => `${u.connector.charAt(0).toUpperCase() + u.connector.slice(1)} could not be checked: ${u.error}`
      ),
    ];

    const publishedSections: PublishedBriefSections = {
      answer: answerText,
      what_i_used: {
        ...draft.sections.what_i_used,
        unchecked: uncheckedBullets,
      },
      evidence: evidenceItems,
      uncertain: uncertainList,
      open_loops: draft.sections.open_loops,
      actions: draft.sections.actions,
      what_i_did_not_do: didNotList,
    };

    const renderRes = renderBriefMarkdown({
      title: draft.title || `Brief: ${question}`,
      as_of: new Date().toISOString(),
      mode,
      status: 'published',
      sections: publishedSections,
    });
    const markdown = renderRes.markdown;

    // Attach computed claim spans from markdown rendering to citations
    for (const item of evidenceItems) {
      const span = renderRes.claimSpans.get(item.claim);
      if (span) {
        for (const cit of item.citations) {
          cit.claim_span = span;
        }
      }
    }

    const validatorRes = validateForPublish({
      markdown,
      evidence: evidenceItems,
      mode,
      criticOutput: criticOut,
      unchecked: uncheckedList,
      sections: publishedSections,
    });

    if (!validatorRes.valid) {
      // Fail closed (FR4.10)
      throw new Error(`Publish validation rejected: ${validatorRes.errors.join('; ')}`);
    }

    // Step: rendering
    await appendProgress(briefId, 'rendering', 'Rendering Markdown and generating PDF artifact');
    const pdfUri = await renderAndStorePdf(briefId, question, markdown);

    // Step: proposing_actions
    await appendProgress(briefId, 'proposing_actions', 'Extracting human-gated action drafts');
    if (draft.sections.actions.length > 0) {
      for (const act of draft.sections.actions) {
        await query(
          `INSERT INTO actions (
            brief_id, workspace_id, type, payload
          ) VALUES ($1, $2, 'email_draft', $3)`,
          [
            briefId,
            workspaceId,
            JSON.stringify({
              summary: act,
              created_at: new Date().toISOString(),
            }),
          ]
        );
      }
    }

    // Persist Citations
    for (const item of evidenceItems) {
      for (const cit of item.citations) {
        await query(
          `INSERT INTO citations (
            workspace_id, brief_id, source_id, source_class, citation_type, claim_span, quote, url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            workspaceId,
            briefId,
            cit.source_id || null,
            cit.source_class,
            cit.citation_type,
            JSON.stringify(cit.claim_span || { start: 0, end: 0 }),
            cit.quote,
            cit.url || null,
          ]
        );
      }
    }

    // Persist Unchecked Citations (FR2.6, NFR4.1)
    for (const u of uncheckedList) {
      await query(
        `INSERT INTO citations (
          workspace_id, brief_id, source_id, source_class, citation_type, claim_span, quote, url
        ) VALUES ($1, $2, null, 'private', 'unchecked', $3, $4, null)`,
        [
          workspaceId,
          briefId,
          JSON.stringify({ start: 0, end: 0 }),
          `${u.connector} could not be checked: ${u.error}`,
        ]
      );
    }

    // Step: published
    const duration = Date.now() - startTime;
    await query(
      `UPDATE briefs SET 
        status = 'published',
        markdown = $2,
        pdf_uri = $3,
        published_at = NOW()
       WHERE id = $1`,
      [briefId, markdown, pdfUri]
    );

    // Persist runs telemetry (FR8.1, NFR6.1)
    await query(
      `INSERT INTO runs (
        brief_id, workspace_id, tokens_in, tokens_out, cost, latency_ms,
        tools_called, circuit_broken, critic_log
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)`,
      [
        briefId,
        workspaceId,
        question.length * 3 + 450,
        markdown.length,
        0.0025,
        duration,
        JSON.stringify(mode === 'world' ? ['retrieval_private', 'retrieval_web'] : ['retrieval_private']),
        JSON.stringify(criticLog),
      ]
    );

    await appendProgress(briefId, 'published', 'Brief successfully validated, rendered, and published');

    const publishedBrief: BriefV1 = {
      id: briefId,
      workspace_id: workspaceId,
      parent_brief_id: parentBriefId,
      question,
      title: draft.title || `Brief: ${question}`,
      mode,
      status: 'published',
      template_version: 'v1',
      as_of: new Date().toISOString(),
      published_at: new Date().toISOString(),
      markdown,
      sections: publishedSections,
      pdf_uri: pdfUri,
      error: null,
    };

    return publishedBrief;
  } catch (err: any) {
    // Fail closed (FR4.10)
    console.error(`[PIPELINE WORKER ERROR on ${briefId}]:`, err);
    await query(
      `UPDATE briefs SET 
        status = 'failed',
        error = $2
       WHERE id = $1`,
      [briefId, err.message || 'generation interrupted']
    );

    await appendProgress(briefId, 'failed', `Failed: ${err.message || 'Pipeline error'}`);
    return null;
  }
}
