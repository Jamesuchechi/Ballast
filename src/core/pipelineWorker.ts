import { query, queryOne, withTransaction } from '@/db/client';
import { retrievePrivateChunks, retrieveWebChunks } from './retrieval';
import { toolRouter, DEFAULT_BRIEF_COST_CAP } from './toolRouter';
import { runWriter } from './writer';
import { runCritic } from './critic';
import { llmCall, estimateLLMCost, type LLMUsage } from './llm';
import { assembleBrief } from './assembler';
import { parseProposedAction } from './actionExecutor';
import { renderAndStorePdf } from './pdfRenderer';
import { createNotification } from './notifications';
import { sendBriefEmailNotification } from './emailService';
import type {
  BriefV1,
  CriticInput,
  RetrievedQuote,
  UncheckedConnector,
} from './types';
import type { SourceBlock } from './sourceFormatter';

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

import { progressBroadcaster } from './progressBroadcaster';

/**
 * Appends a step to briefs.progress JSONB column in PostgreSQL
 * and broadcasts real-time events for SSE streaming (Audit M10)
 */
export async function appendProgress(
  briefId: string,
  step: string,
  message?: string,
  meta?: Record<string, any>
): Promise<void> {
  const timestamp = new Date().toISOString();
  const entry: WorkerProgressEntry = {
    step,
    timestamp,
    message,
    meta,
  };

  const updated = await queryOne<{ status: string; progress: any; error: string | null }>(
    `UPDATE briefs 
     SET progress = COALESCE(progress, '[]'::jsonb) || $2::jsonb 
     WHERE id = $1
     RETURNING status, progress, error`,
    [briefId, JSON.stringify([entry])]
  );

  // Broadcast real-time event to SSE listeners (M10)
  progressBroadcaster.broadcast(briefId, {
    briefId,
    step,
    message: message || step,
    status: (step === 'published' || step === 'failed')
      ? (step as any)
      : ((updated?.status as any) || 'running'),
    timestamp,
    error: updated?.error || (step === 'failed' ? message : null),
    progress: updated?.progress || [entry],
  });
}

/**
 * Runs the full Phase 4 async generation pipeline for a queued brief.
 * Supports Home (private only) and World (private + web) modes with two-pass retrieval (FR3.3, FR4.2).
 */
export async function processQueuedBrief(
  briefId: string,
  options?: { costCap?: number }
): Promise<BriefV1 | null> {
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

  // Idempotency guard: do not re-process already running or published briefs
  if (briefRow.status !== 'queued') {
    return null;
  }

  const { workspace_id: workspaceId, question, mode, parent_brief_id: parentBriefId } = briefRow;

  try {
    let totalCost = 0; // Starts at $0; accumulates actual tool and LLM token costs
    let circuitBroken = false;
    let circuitBrokenReason: string | null = null;
    const toolsCalled: string[] = ['retrieval_private'];

    // Transition to running atomically
    const acquired = await query(
      `UPDATE briefs SET status = 'running' WHERE id = $1 AND status = 'queued' RETURNING id`,
      [briefId]
    );
    if (acquired.length === 0) {
      return null;
    }

    // Step: planning
    await appendProgress(briefId, 'planning', `Planning retrieval passes for mode=${mode}…`);

    // Step: retrieving_private (Pass 1 - Honest connector progress per NFR7.3)
    const connectedSources = await query<{ connector: string }>(
      `SELECT DISTINCT connector FROM sources WHERE workspace_id = $1`,
      [workspaceId]
    );
    const connectorNames = connectedSources.map((s) => s.connector);
    const honestProgressLabel = connectorNames.length > 0
      ? `checking ${connectorNames.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(' & ')}…`
      : 'checking connected sources…';

    await appendProgress(briefId, 'retrieving_private', honestProgressLabel);
    const privateRetrieval = await retrievePrivateChunks({
      workspaceId,
      queryText: question,
      limit: 8,
      briefId,
    });

    let webRetrieval = {
      quotes: [] as RetrievedQuote[],
      sources: [] as SourceBlock[],
      totalChunksSearched: 0,
    };

    // Step: retrieving_web (Pass 2 - Web sources only per FR2.7, FR3.3, FR3.4)
    if (mode === 'home') {
      await appendProgress(
        briefId,
        'retrieving_web',
        'Web retrieval disabled in Home mode (FR3.4)'
      );
    } else {
      await appendProgress(briefId, 'retrieving_web', 'checking web sources & articles…');
      toolsCalled.push('web_search');

      const webToolResult = await toolRouter.executeWebSearch(question, {
        workspaceId,
        briefId,
        mode,
        currentCost: totalCost,
        costCap: options?.costCap ?? DEFAULT_BRIEF_COST_CAP,
      });

      totalCost += webToolResult.costIncurred;

      if (webToolResult.circuitBroken) {
        circuitBroken = true;
        circuitBrokenReason = webToolResult.explanation || 'Cost ceiling reached';
      }

      toolsCalled.push('retrieval_web');
      webRetrieval = await retrieveWebChunks({
        workspaceId,
        queryText: question,
        limit: 6,
        briefId,
      });
    }

    // Combine independently retrieved passes (FR3.3)
    const allQuotes: RetrievedQuote[] = [
      ...privateRetrieval.quotes,
      ...webRetrieval.quotes,
    ];

    const allSources: SourceBlock[] = [
      ...privateRetrieval.sources,
      ...webRetrieval.sources,
    ];

    // Load parent brief context if chained (FR7.1, FR7.3)
    let parentBriefData: { question: string; as_of?: string; summary?: string } | null = null;
    if (parentBriefId) {
      const parentRow = await queryOne<{ question: string; markdown: string; as_of: string; summary: string | null }>(
        `SELECT question, markdown, as_of, summary FROM briefs WHERE id = $1`,
        [parentBriefId]
      );
      if (parentRow) {
        parentBriefData = {
          question: parentRow.question,
          as_of: parentRow.as_of,
          summary: parentRow.summary || (parentRow.markdown ? parentRow.markdown.slice(0, 400) : undefined),
        };
      }
    }

    // Track actual tokens and cost consumed across pipeline LLM stages (Writer + Critic)
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalLLMCost = 0;
    const trackUsage = (usage: LLMUsage, meta?: { provider: string; model: string }) => {
      totalTokensIn += usage.promptTokens;
      totalTokensOut += usage.completionTokens;
      if (meta) {
        const callCost = estimateLLMCost(meta.provider, meta.model, usage.promptTokens, usage.completionTokens);
        totalLLMCost += callCost;
      }
    };

    // Step: drafting
    await appendProgress(briefId, 'drafting', 'drafting brief sections…');
    const draft = await runWriter({
      question,
      mode,
      sources: allSources,
      retrieved: allQuotes,
      parentBrief: parentBriefData,
      llmCall: (prompt, sysPrompt) =>
        llmCall(prompt, sysPrompt, { role: 'writer', onUsage: trackUsage }),
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
    await appendProgress(briefId, 'verifying', 'verifying claims against citations…');
    const criticInput: CriticInput = {
      question,
      mode,
      retrieved: allQuotes,
      draft_brief: draft,
      unchecked: uncheckedList,
    };

    const criticOut = await runCritic({
      input: criticInput,
      llmCall: (prompt, sysPrompt) =>
        llmCall(prompt, sysPrompt, { role: 'critic', onUsage: trackUsage }),
    });

    // Step: validating (Publish Validator Gate)
    await appendProgress(briefId, 'validating', 'validating assertions…');

    const assembled = assembleBrief({
      draft,
      criticOut,
      retrieved: allQuotes,
      sources: allSources,
      unchecked: uncheckedList,
      question,
      mode,
      circuitBroken,
      circuitBrokenReason,
    });

    const {
      criticLog,
      evidenceItems,
      sanitizedActions,
      markdown,
      sections: publishedSections,
      quoteMap,
    } = assembled;

    if (!assembled.validation.valid) {
      // Fail closed (FR4.10)
      throw new Error(`Publish validation rejected: ${assembled.validation.errors.join('; ')}`);
    }

    // Step: rendering
    await appendProgress(briefId, 'rendering', 'rendering Markdown and PDF…');
    const pdfUri = await renderAndStorePdf(briefId, question, markdown);

    // Step: proposing_actions
    await appendProgress(briefId, 'proposing_actions', 'proposing action drafts…');

    // Atomic persistence phase (D7): Wrap actions, citations, brief status, and runs telemetry in a transaction
    await withTransaction(async (txClient) => {
      // 1. Propose Actions
      if (sanitizedActions.length > 0) {
        for (const act of sanitizedActions) {
          const parsed = parseProposedAction(act);
          await txClient.query(
            `INSERT INTO actions (
              brief_id, workspace_id, type, payload
            ) VALUES ($1, $2, $3, $4)`,
            [
              briefId,
              workspaceId,
              parsed.type,
              JSON.stringify(parsed.payload),
            ]
          );
        }
      }

      // 2. Persist Citations (Support - with authentic source_class: 'private' | 'web')
      for (const item of evidenceItems) {
        for (const cit of item.citations) {
          await txClient.query(
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

      // 3. Persist Conflict Citations (FR4.5)
      for (const c of criticOut.conflicts) {
        for (const citId of c.citation_ids) {
          const q = quoteMap.get(citId);
          if (q) {
            await txClient.query(
              `INSERT INTO citations (
                workspace_id, brief_id, source_id, source_class, citation_type, claim_span, quote, url
              ) VALUES ($1, $2, $3, $4, 'conflict', $5, $6, $7)`,
              [
                workspaceId,
                briefId,
                q.source_id || null,
                q.source_class,
                JSON.stringify({ start: 0, end: 0 }),
                q.quote,
                q.url || null,
              ]
            );
          }
        }
      }

      // 4. Persist Unchecked Citations (FR2.6, NFR4.1)
      for (const u of uncheckedList) {
        await txClient.query(
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

      // 5. Update brief status to published
      await txClient.query(
        `UPDATE briefs SET 
          status = 'published',
          markdown = $2,
          pdf_uri = $3,
          published_at = NOW(),
          summary = $4
         WHERE id = $1`,
        [briefId, markdown, pdfUri, assembled.summary || null]
      );

      // 5b. Advance schedule's last_run_brief_id ONLY on successful publication (Audit M6)
      await txClient.query(
        `UPDATE schedules SET last_run_brief_id = $1 WHERE id = (
          SELECT schedule_id FROM briefs WHERE id = $1 AND schedule_id IS NOT NULL
        )`,
        [briefId]
      );

      // 6. Persist runs telemetry with real accumulated token usage and actual cost (FR8.1, FR8.3, NFR6.1)
      const duration = Date.now() - startTime;
      const tokensIn = totalTokensIn > 0 ? totalTokensIn : Math.ceil((question.length * 3 + 450) / 4);
      const tokensOut = totalTokensOut > 0 ? totalTokensOut : Math.ceil(markdown.length / 4);
      const finalRunCost = Number((totalCost + totalLLMCost).toFixed(6));

      await txClient.query(
        `INSERT INTO runs (
          brief_id, workspace_id, tokens_in, tokens_out, cost, latency_ms,
          tools_called, circuit_broken, critic_log
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          briefId,
          workspaceId,
          tokensIn,
          tokensOut,
          finalRunCost,
          duration,
          JSON.stringify(toolsCalled),
          circuitBroken,
          JSON.stringify(criticLog),
        ]
      );
    });

    await appendProgress(briefId, 'published', 'Brief successfully published');

    // Notify workspace on published brief (FR7.2 & Part 2.2)
    try {
      await createNotification({
        workspaceId,
        briefId,
        type: 'brief_published',
        title: draft.title || `Brief: ${question}`,
        message: `Brief successfully published with ${publishedSections.evidence?.length || 0} verified claim(s).`,
      });
    } catch (notifErr) {
      console.warn('[Notification Publish Error]:', notifErr);
    }

    // Worker transactional email dispatch (non-blocking, opt-out-able)
    sendBriefEmailNotification({
      workspaceId,
      briefId,
      type: 'brief_published',
      title: draft.title || `Brief: ${question}`,
      question,
      summaryOrError: assembled.summary,
      claimCount: publishedSections.evidence?.length || 0,
      pdfUri,
    }).catch((emailErr) => console.warn('[Email Dispatch Publish Error]:', emailErr));

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
      summary: assembled.summary || null,
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

    // Notify workspace on failed brief (FR7.2 & Part 2.2)
    try {
      await createNotification({
        workspaceId,
        briefId,
        type: 'brief_failed',
        title: `Brief Failed: ${question.slice(0, 40)}`,
        message: err.message || 'Pipeline generation failed.',
      });
    } catch (notifErr) {
      console.warn('[Notification Fail Error]:', notifErr);
    }

    // Worker transactional email dispatch (non-blocking, opt-out-able)
    sendBriefEmailNotification({
      workspaceId,
      briefId,
      type: 'brief_failed',
      title: `Brief Failed: ${question.slice(0, 40)}`,
      question,
      summaryOrError: err.message || 'Pipeline generation failed.',
    }).catch((emailErr) => console.warn('[Email Dispatch Fail Error]:', emailErr));

    return null;
  }
}
