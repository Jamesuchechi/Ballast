import { randomUUID } from "node:crypto";
import type {
  BriefMode,
  BriefV1,
  CriticInput,
  CriticLog,
  PublishedEvidenceItem,
  PublishedBriefSections,
  RetrievedQuote,
  UncheckedConnector,
} from "./types";
import type { SourceBlock } from "./sourceFormatter";
import { runWriter } from "./writer";
import { runCritic } from "./critic";
import { llmCall as defaultLlmCall } from "./llm";
import { renderBriefMarkdown } from "./renderer";
import { validateForPublish } from "./validator";

export interface GenerateBriefOptions {
  question: string;
  mode: BriefMode;
  sources: SourceBlock[];
  retrieved: RetrievedQuote[];
  unchecked?: UncheckedConnector[];
  workspaceId?: string;
  parentBriefId?: string | null;
  llmCall?: (prompt: string, systemPrompt: string) => Promise<string>;
}

export interface PipelineResult {
  brief: BriefV1;
  criticLog: CriticLog;
  success: boolean;
}

/**
 * Runs the complete Phase 0 generation pipeline:
 * retrieve -> draft -> critic -> json-schema validate -> publish validator -> render
 */
export async function generateBrief(
  options: GenerateBriefOptions
): Promise<PipelineResult> {
  const {
    question,
    mode,
    sources,
    retrieved,
    unchecked = [],
    workspaceId = "ws_dev",
    parentBriefId = null,
    llmCall: explicitLlmCall,
  } = options;

  const briefId = `brief_${randomUUID()}`;
  const asOf = new Date().toISOString();

  const isMockAllowed =
    process.env.EVAL_USE_MOCK === "true" || process.env.NODE_ENV === "test";

  const writerLlm =
    explicitLlmCall ??
    (!isMockAllowed
      ? (prompt: string, sys: string) => defaultLlmCall(prompt, sys, { role: "writer" })
      : undefined);

  const criticLlm =
    explicitLlmCall ??
    (!isMockAllowed
      ? (prompt: string, sys: string) => defaultLlmCall(prompt, sys, { role: "critic" })
      : undefined);

  // 1. Run Writer (internal draft, never directly published)
  const draft = await runWriter({
    question,
    mode,
    sources,
    retrieved,
    llmCall: writerLlm,
  });

  // 2. Prepare Critic Input
  const criticInput: CriticInput = {
    question,
    mode,
    retrieved,
    draft_brief: draft,
    unchecked,
  };

  // 3. Run Critic
  const criticOut = await runCritic({
    input: criticInput,
    llmCall: criticLlm,
  });

  // Build critic_log
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

  // Quote lookup map
  const quoteMap = new Map(retrieved.map((q) => [q.id, q]));

  // Build published evidence from keep claims only
  const evidenceItems: PublishedEvidenceItem[] = [];
  for (const k of criticOut.keep) {
    const citations = k.citation_ids
      .map((id) => quoteMap.get(id))
      .filter((q): q is RetrievedQuote => q !== undefined)
      .map((q) => ({
        source_class: q.source_class,
        citation_type: "support" as const,
        quote: q.quote,
        source_id: q.source_id,
        url: q.url || null,
      }));

    if (citations.length > 0) {
      evidenceItems.push({
        claim: k.claim,
        citations,
      });
    }
  }

  // 4. Handle Answer construction & FR4.9 (Empty Evidence Path)
  let answer = "";
  const uncertain = [...draft.sections.uncertain];
  const whatIDidNotDo = [...draft.sections.what_i_did_not_do];

  if (evidenceItems.length === 0) {
    // Empty evidence path: Answer refuses/explains lack of facts, Uncertain filled, status published
    answer = "No grounded answer is possible based on the available sources.";
    for (const m of criticOut.missing) {
      if (!uncertain.includes(m.gap)) {
        uncertain.push(m.gap);
      }
    }
    if (uncertain.length === 0) {
      uncertain.push(
        `The provided sources do not contain information to address "${question}".`
      );
    }
  } else {
    // Grounded path: Compose Answer strictly from critic keep claims (never raw writer draft)
    const answerBullets = criticOut.keep.map((k) => `- ${k.claim}`);
    answer = answerBullets.slice(0, 10).join("\n");
  }

  // Filter actions against dropped/injected claims
  const sanitizedActions: string[] = [];
  const droppedClaimTexts = criticOut.drop.map((d) => d.claim.toLowerCase());
  for (const act of draft.sections.actions) {
    const isDropped = droppedClaimTexts.some((d) => act.toLowerCase().includes(d) || d.includes(act.toLowerCase()));
    if (isDropped) {
      whatIDidNotDo.push(`Refused unapproved action derived from dropped/injected source text: "${act}"`);
    } else {
      sanitizedActions.push(act);
    }
  }

  // Add conflicts to Uncertain
  for (const c of criticOut.conflicts) {
    const conflictDesc = `Conflict detected: ${c.topic} between cited sources.`;
    if (!uncertain.includes(conflictDesc)) {
      uncertain.push(conflictDesc);
    }
  }

  // Add critic did_not entries to What I did not do
  for (const d of criticOut.did_not) {
    if (!whatIDidNotDo.includes(d)) {
      whatIDidNotDo.push(d);
    }
  }

  // Format What I used
  const privateSourceNames = sources
    .filter((s) => s.class === "private")
    .map((s) => s.id);
  const webSourceNames = sources
    .filter((s) => s.class === "web")
    .map((s) => s.id);
  const uncheckedNames = unchecked.map((u) => `${u.connector} — ${u.error}`);

  const publishedSections: PublishedBriefSections = {
    answer,
    what_i_used: {
      private: privateSourceNames,
      web: webSourceNames,
      unchecked: uncheckedNames,
    },
    evidence: evidenceItems,
    uncertain,
    open_loops: draft.sections.open_loops,
    actions: sanitizedActions,
    what_i_did_not_do: whatIDidNotDo,
  };

  // 5. Render markdown and compute claim_spans
  const renderResult = renderBriefMarkdown({
    title: draft.title,
    as_of: asOf,
    mode,
    status: "published",
    sections: publishedSections,
  });

  // Attach computed claim_spans into evidence citations
  for (const ev of publishedSections.evidence) {
    const span = renderResult.claimSpans.get(ev.claim);
    if (span) {
      for (const cit of ev.citations) {
        cit.claim_span = span;
      }
    }
  }

  // 6. Run Pure Publish Validator
  const validation = validateForPublish({
    markdown: renderResult.markdown,
    mode,
    criticOutput: criticOut,
    evidence: publishedSections.evidence,
    unchecked,
    sections: publishedSections,
  });

  const finalStatus = validation.valid ? "published" : "failed";
  const errorMessage = validation.valid ? null : validation.errors.join("; ");

  const brief: BriefV1 = {
    id: briefId,
    workspace_id: workspaceId,
    parent_brief_id: parentBriefId,
    question,
    mode,
    status: finalStatus,
    template_version: "v1",
    as_of: asOf,
    published_at: validation.valid ? asOf : null,
    title: draft.title,
    markdown: renderResult.markdown,
    pdf_uri: null,
    error: errorMessage,
    sections: publishedSections,
  };

  return {
    brief,
    criticLog,
    success: validation.valid,
  };
}
