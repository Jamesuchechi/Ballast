import { query, queryOne } from '@/db/client';
import { retrievePrivateChunks, retrieveWebChunks } from './retrieval';
import { toolRouter, DEFAULT_BRIEF_COST_CAP } from './toolRouter';
import { runWriter } from './writer';
import { runCritic } from './critic';
import { llmCall, estimateLLMCost, type LLMUsage } from './llm';
import { renderBriefMarkdown } from './renderer';
import { validateForPublish } from './validator';
import { renderAndStorePdf } from './pdfRenderer';
import { createNotification } from './notifications';
import { sendBriefEmailNotification } from './emailService';
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
      const parentRow = await queryOne<{ question: string; markdown: string; as_of: string }>(
        `SELECT question, markdown, as_of FROM briefs WHERE id = $1`,
        [parentBriefId]
      );
      if (parentRow) {
        parentBriefData = {
          question: parentRow.question,
          as_of: parentRow.as_of,
          summary: parentRow.markdown ? parentRow.markdown.slice(0, 400) : undefined,
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
    await appendProgress(briefId, 'validating', 'validating assertions…');

    const quoteMap = new Map(allQuotes.map((q) => [q.id, q]));
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
    let answerText = '';
    if (!hasEvidence) {
      answerText = 'No citable evidence was found in the indexed corpus to answer this query.\nAsserted claims were withheld to prevent ungrounded hallucinations.';
    } else {
      // Synthesize answer strictly from verified keep claims (never raw writer draft)
      const answerBullets = criticOut.keep.map((k) => `- ${k.claim}`);
      answerText = answerBullets.slice(0, 10).join('\n');
      if (criticOut.conflicts.length > 0) {
        answerText += '\n\n*Note: Discrepancy detected across cited sources. Disagreements are detailed in the Uncertain section and citations rather than arbitrarily selecting a winner.*';
      }
    }

    const uncertainList = hasEvidence
      ? [...draft.sections.uncertain]
      : [
          ...draft.sections.uncertain,
          'Private corpus does not contain documented statements directly answering the question.',
        ];

    // Surface conflicts into Uncertain section (FR4.5)
    for (const c of criticOut.conflicts) {
      const conflictDesc = `Conflict detected: ${c.topic} between cited sources.`;
      if (!uncertainList.includes(conflictDesc)) {
        uncertainList.push(conflictDesc);
      }
    }

    const didNotList = [
      ...draft.sections.what_i_did_not_do,
      'Did not publish ungrounded or unsourced assertions.',
    ];

    if (criticOut.conflicts.length > 0) {
      didNotList.push('Did not arbitrarily resolve cross-source disagreements or silently pick a winner.');
    }

    // Explain circuit breaker if tripped (FR8.3)
    if (circuitBroken && circuitBrokenReason) {
      didNotList.push(circuitBrokenReason);
    }

    // Filter actions against dropped claims / prompt injections
    const sanitizedActions: string[] = [];
    const droppedTexts = criticOut.drop.map((d) => d.claim.toLowerCase());
    for (const act of draft.sections.actions) {
      const isDropped = droppedTexts.some((d) => act.toLowerCase().includes(d) || d.includes(act.toLowerCase()));
      if (isDropped) {
        didNotList.push(`Refused ungrounded/injected action draft: "${act}"`);
      } else {
        sanitizedActions.push(act);
      }
    }

    // Merge critic did_not entries
    for (const d of criticOut.did_not) {
      if (!didNotList.includes(d)) {
        didNotList.push(d);
      }
    }

    const uncheckedBullets = [
      ...draft.sections.what_i_used.unchecked,
      ...uncheckedList.map(
        (u) => `${u.connector.charAt(0).toUpperCase() + u.connector.slice(1)} could not be checked: ${u.error}`
      ),
    ];

    const privateSourceLabels = Array.from(
      new Set(allSources.filter((s) => s.class === 'private').map((s) => s.id))
    );
    const webSourceLabels = Array.from(
      new Set(allSources.filter((s) => s.class === 'web').map((s) => s.id))
    );

    const publishedSections: PublishedBriefSections = {
      answer: answerText,
      what_i_used: {
        private: privateSourceLabels.length > 0 ? privateSourceLabels : draft.sections.what_i_used.private,
        web: webSourceLabels.length > 0 ? webSourceLabels : draft.sections.what_i_used.web,
        unchecked: uncheckedBullets,
      },
      evidence: evidenceItems,
      uncertain: uncertainList,
      open_loops: draft.sections.open_loops,
      actions: sanitizedActions,
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
    await appendProgress(briefId, 'rendering', 'rendering Markdown and PDF…');
    const pdfUri = await renderAndStorePdf(briefId, question, markdown);

    // Step: proposing_actions
    await appendProgress(briefId, 'proposing_actions', 'proposing action drafts…');
    if (sanitizedActions.length > 0) {
      for (const act of sanitizedActions) {
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

    // Persist Citations (Support - with authentic source_class: 'private' | 'web')
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

    // Persist Conflict Citations (FR4.5)
    for (const c of criticOut.conflicts) {
      for (const citId of c.citation_ids) {
        const q = quoteMap.get(citId);
        if (q) {
          await query(
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

    // Persist runs telemetry with real accumulated token usage and actual cost (FR8.1, FR8.3, NFR6.1)
    const tokensIn = totalTokensIn > 0 ? totalTokensIn : Math.ceil((question.length * 3 + 450) / 4);
    const tokensOut = totalTokensOut > 0 ? totalTokensOut : Math.ceil(markdown.length / 4);
    const finalRunCost = Number((totalCost + totalLLMCost).toFixed(6));

    await query(
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
