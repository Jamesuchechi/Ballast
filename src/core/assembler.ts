import type {
  BriefMode,
  CitationRecord,
  CriticLog,
  CriticOutput,
  DraftBrief,
  PublishedBriefSections,
  PublishedEvidenceItem,
  RetrievedQuote,
  SourceBlock,
  UncheckedConnector,
} from "./types";
import { renderBriefMarkdown } from "./renderer";
import { validateForPublish, type PublishValidationResult } from "./validator";

export interface AssembleBriefOptions {
  draft: DraftBrief;
  criticOut: CriticOutput;
  retrieved: RetrievedQuote[];
  sources?: SourceBlock[];
  unchecked?: UncheckedConnector[];
  question: string;
  mode: BriefMode;
  asOf?: string;
  circuitBroken?: boolean;
  circuitBrokenReason?: string | null;
}

export interface AssembledBrief {
  criticLog: CriticLog;
  sections: PublishedBriefSections;
  evidenceItems: PublishedEvidenceItem[];
  sanitizedActions: string[];
  markdown: string;
  claimSpans: Map<string, { start: number; end: number }>;
  validation: PublishValidationResult;
  quoteMap: Map<string, RetrievedQuote>;
  title: string;
  asOf: string;
  summary?: string;
}

/**
 * Pure, deterministic brief assembler.
 * Combines the Writer's draft, Critic's evaluation, and retrieved quotes/sources
 * into a fully grounded PublishedBriefSections, rendered Markdown with claim spans,
 * and publish validation result.
 * 
 * Used by both stateless eval pipeline (pipeline.ts) and background worker (pipelineWorker.ts).
 */
export function assembleBrief(options: AssembleBriefOptions): AssembledBrief {
  const {
    draft,
    criticOut,
    retrieved,
    sources = [],
    unchecked = [],
    question,
    mode,
    asOf = new Date().toISOString(),
    circuitBroken = false,
    circuitBrokenReason = null,
  } = options;

  // 1. Build critic_log
  const criticLog: CriticLog = {
    claims_in: draft.sections.evidence?.length || 0,
    claims_kept: criticOut.keep.length,
    claims_dropped: criticOut.drop.length,
    keep: criticOut.keep,
    drop: criticOut.drop,
    conflicts: criticOut.conflicts,
    missing: criticOut.missing,
    did_not: criticOut.did_not,
  };

  // 2. Build quote lookup map
  const quoteMap = new Map(retrieved.map((q) => [q.id, q]));

  // 3. Build published evidence from keep claims only
  const evidenceItems: PublishedEvidenceItem[] = [];
  for (const k of criticOut.keep) {
    const citations: CitationRecord[] = k.citation_ids
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
  const hasEvidence = evidenceItems.length > 0;
  let answer = "";
  const uncertain = [...(draft.sections.uncertain || [])];
  const whatIDidNotDo = [...(draft.sections.what_i_did_not_do || [])];

  if (!hasEvidence) {
    // Empty evidence path (FR4.9): if keep is empty, publish with empty/refusal Answer and filled Uncertain
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
    if (criticOut.conflicts.length > 0) {
      answer +=
        "\n\n*Note: Discrepancy detected across cited sources. Disagreements are detailed in the Uncertain section and citations rather than arbitrarily selecting a winner.*";
    }
  }

  // Surface conflicts into Uncertain section (FR4.5)
  for (const c of criticOut.conflicts) {
    const conflictDesc = `Conflict detected: ${c.topic} between cited sources.`;
    if (!uncertain.includes(conflictDesc)) {
      uncertain.push(conflictDesc);
    }
  }

  if (criticOut.conflicts.length > 0) {
    const conflictNotice =
      "Did not arbitrarily resolve cross-source disagreements or silently pick a winner.";
    if (!whatIDidNotDo.includes(conflictNotice)) {
      whatIDidNotDo.push(conflictNotice);
    }
  }

  // Explain circuit breaker if tripped (FR8.3)
  if (circuitBroken && circuitBrokenReason) {
    if (!whatIDidNotDo.includes(circuitBrokenReason)) {
      whatIDidNotDo.push(circuitBrokenReason);
    }
  }

  // Filter actions against dropped/injected claims
  const sanitizedActions: string[] = [];
  const droppedClaimTexts = criticOut.drop.map((d) => d.claim.toLowerCase());
  for (const act of draft.sections.actions || []) {
    const isDropped = droppedClaimTexts.some(
      (d) => act.toLowerCase().includes(d) || d.includes(act.toLowerCase())
    );
    if (isDropped) {
      whatIDidNotDo.push(
        `Refused unapproved action derived from dropped/injected source text: "${act}"`
      );
    } else {
      sanitizedActions.push(act);
    }
  }

  // Merge critic did_not entries to What I did not do
  for (const d of criticOut.did_not) {
    if (!whatIDidNotDo.includes(d)) {
      whatIDidNotDo.push(d);
    }
  }

  // Format What I used
  const privateSourceLabels = Array.from(
    new Set(
      sources.length > 0
        ? sources.filter((s) => s.class === "private").map((s) => s.id)
        : draft.sections.what_i_used?.private || []
    )
  );

  const webSourceLabels = Array.from(
    new Set(
      sources.length > 0
        ? sources.filter((s) => s.class === "web").map((s) => s.id)
        : draft.sections.what_i_used?.web || []
    )
  );

  const uncheckedBullets = [
    ...(draft.sections.what_i_used?.unchecked || []),
    ...unchecked.map(
      (u) =>
        `${u.connector.charAt(0).toUpperCase() + u.connector.slice(1)} could not be checked: ${u.error}`
    ),
  ];
  const uniqueUnchecked = Array.from(new Set(uncheckedBullets));

  // 4b. Construct TL;DR summary grounded strictly in keep claims (Audit E1)
  let summary: string | undefined = undefined;
  if (!hasEvidence) {
    summary = "No grounded information found in connected sources for this query.";
  } else {
    // Generate grounded summary: 1-2 concise sentences directly from keep claims
    const keepClaims = criticOut.keep.map((k) => k.claim.trim().replace(/\.$/, ""));
    if (keepClaims.length > 0) {
      const topClaims = keepClaims.slice(0, 2);
      summary = topClaims.join(". ") + ".";
    }
  }

  const publishedSections: PublishedBriefSections = {
    summary,
    answer,
    what_i_used: {
      private:
        privateSourceLabels.length > 0
          ? privateSourceLabels
          : draft.sections.what_i_used?.private || [],
      web:
        webSourceLabels.length > 0
          ? webSourceLabels
          : draft.sections.what_i_used?.web || [],
      unchecked: uniqueUnchecked,
    },
    evidence: evidenceItems,
    uncertain,
    open_loops: draft.sections.open_loops || [],
    actions: sanitizedActions,
    what_i_did_not_do: whatIDidNotDo,
  };

  // 5. Render markdown and compute claim_spans
  const title = draft.title || `Brief: ${question}`;
  const renderResult = renderBriefMarkdown({
    title,
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

  return {
    criticLog,
    sections: publishedSections,
    evidenceItems,
    sanitizedActions,
    markdown: renderResult.markdown,
    claimSpans: renderResult.claimSpans,
    validation,
    quoteMap,
    title,
    asOf,
    summary,
  };
}
