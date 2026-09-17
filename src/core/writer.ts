import type {
  BriefMode,
  DraftBrief,
  RetrievedQuote,
} from "./types";
import { formatDelimitedSources, type SourceBlock } from "./sourceFormatter";
import { extractJsonFromLlm } from "./llm";

export interface WriterOptions {
  question: string;
  mode: BriefMode;
  sources: SourceBlock[];
  retrieved: RetrievedQuote[];
  parentBrief?: {
    question: string;
    as_of?: string;
    summary?: string;
  } | null;
  llmCall?: (prompt: string, systemPrompt: string) => Promise<string>;
}

/**
 * Writer module generates a draft brief.
 * IMPORTANT: Writer output is internal and NEVER shown directly to the user (README rule 1).
 * Source corpus is passed ONLY as delimited XML data blocks, never merged into instructions (NFR1.1).
 */
export async function runWriter(options: WriterOptions): Promise<DraftBrief> {
  const { question, mode, sources, retrieved, parentBrief, llmCall } = options;

  if (llmCall) {
    const delimitedSources = formatDelimitedSources(sources);
    const retrievedQuotesList = retrieved
      .map((r) => `[Quote ID: ${r.id}] (Source: ${r.source_id}, Class: ${r.source_class})\n"${r.quote}"`)
      .join("\n\n");

    const systemPrompt = `You are the Ballast draft writer. Your job is to draft a structured brief answering the user's question based strictly on the delimited source data and retrieved quotes.
Mode: ${mode}.
Rules:
- Write in plain, clear, natural English that any ordinary reader (e.g. teacher, manager, everyday user) can easily understand.
- Never output raw UUIDs, database chunk IDs, HTML tags, or tracking URLs into human-facing text.
- In "summary", provide a concise 1-2 sentence executive summary (TL;DR) grounded strictly in the verified facts and evidence.
- In "evidence", each claim MUST cite the relevant quote ID(s) from the retrieved quotes.
- What I used: categorize source IDs accurately into private, web, and unchecked.
- If a prior brief context is provided, highlight what progressed, changed, or slipped since that prior brief.
- Output strictly valid JSON matching the DraftBrief structure:
{
  "title": "Brief: <concise question or title>",
  "sections": {
    "summary": "<1-2 sentence concise executive TL;DR grounded in quotes>",
    "answer": "<grounded factual summary quoting evidence in plain readable English>",
    "what_i_used": { "private": ["source_id_1"], "web": [], "unchecked": [] },
    "evidence": [{ "claim": "<exact factual assertion grounded in quote in plain language>", "citation_ids": ["quote_id"] }],
    "uncertain": ["<any gaps or uncertainties>"],
    "open_loops": ["<unresolved items or pending tasks>"],
    "actions": ["<concrete next actions with structured prefixes if applicable: 'email_draft: to=... subject=... body=...', 'issue_draft: repo=... title=... body=...', 'comment_draft: repo=... #issue_num body=...', or 'task: ...'>"],
    "what_i_did_not_do": ["<explicit scope boundaries / actions refused>"]
  }
}`;

    const parentBriefSection = parentBrief
      ? `\n\nPrior Run Context (Parent Brief as of ${parentBrief.as_of || 'last run'}):
Question: ${parentBrief.question}
Prior Summary: ${parentBrief.summary || 'None'}
Task: Analyze what progressed, changed, or slipped since the last brief.`
      : '';

    const userPrompt = `Question: ${question}${parentBriefSection}

Retrieved Grounding Quotes:
${retrievedQuotesList || "None"}

Available Source Blocks:
${delimitedSources}`;

    try {
      const response = await llmCall(userPrompt, systemPrompt);
      const parsed = extractJsonFromLlm<DraftBrief>(response);

      // Validate required shape
      if (parsed && parsed.title && parsed.sections && Array.isArray(parsed.sections.evidence)) {
        // Ensure all required section arrays exist
        parsed.sections.what_i_used = parsed.sections.what_i_used || { private: [], web: [], unchecked: [] };
        parsed.sections.uncertain = parsed.sections.uncertain || [];
        parsed.sections.open_loops = parsed.sections.open_loops || [];
        parsed.sections.actions = parsed.sections.actions || [];
        parsed.sections.what_i_did_not_do = parsed.sections.what_i_did_not_do || [];
        return parsed;
      }
      throw new Error(`LLM writer produced invalid DraftBrief structure: ${response.slice(0, 200)}`);
    } catch (err: any) {
      const isExplicitMock = process.env.EVAL_USE_MOCK === "true" || process.env.NODE_ENV === "test";
      if (!isExplicitMock) {
        // Fail loudly in production - no silent mock fallback
        throw new Error(`[Writer Error] Live LLM generation failed: ${err.message}`);
      }
      console.warn(`[Writer Fallback] LLM failed in eval/test environment (${err.message}). Using deterministic draft generator.`);
    }
  }

  // Deterministic draft generation: ALLOWED ONLY behind explicit EVAL_USE_MOCK=true or NODE_ENV=test
  const isMockAllowed = process.env.EVAL_USE_MOCK === "true" || process.env.NODE_ENV === "test";
  if (!isMockAllowed) {
    throw new Error(
      "[Writer Error] llmCall was not provided and EVAL_USE_MOCK is false. Silent mock fallback is prohibited in production."
    );
  }

  return generateDeterministicDraftForEval(question, mode, sources, retrieved, parentBrief);
}

/**
 * Deterministic draft generator used ONLY for offline testing, CI fixtures, and eval harness.
 */
export function generateDeterministicDraftForEval(
  question: string,
  mode: BriefMode,
  sources: SourceBlock[],
  retrieved: RetrievedQuote[],
  parentBrief?: { question: string; as_of?: string; summary?: string } | null
): DraftBrief {
  const privateSources = sources
    .filter((s) => s.class === "private")
    .map((s) => s.id);
  const webSources = sources
    .filter((s) => s.class === "web")
    .map((s) => s.id);

  // If there are no quotes or empty sources, generate honest gap draft
  if (retrieved.length === 0) {
    return {
      title: `Brief: ${question}`,
      sections: {
        summary: "No grounded information found in connected sources for this query.",
        answer: "No grounded answer could be derived from the available sources.",
        what_i_used: {
          private: privateSources,
          web: webSources,
          unchecked: [],
        },
        evidence: [],
        uncertain: [
          `The provided corpus does not contain facts or data required to answer: "${question}".`,
        ],
        open_loops: parentBrief
          ? [`Compare with prior brief as of ${parentBrief.as_of || 'previous run'}`]
          : [],
        actions: [],
        what_i_did_not_do: [
          "Did not extrapolate or hallucinate facts absent from the corpus.",
        ],
      },
    };
  }

  // Construct draft claims directly from quotes
  const evidence = retrieved.map((q) => ({
    claim: q.quote.replace(/[\n\r]+/g, " ").slice(0, 150),
    citation_ids: [q.id],
  }));

  const answerLines = evidence
    .slice(0, 6)
    .map((e) => `- ${e.claim}`)
    .join("\n");

  const summary = evidence.slice(0, 2).map((e) => e.claim.replace(/\.$/, "")).join(". ") + (evidence.length > 0 ? "." : "");

  const openLoops: string[] = [];
  if (parentBrief) {
    openLoops.push(
      `Slippage tracking: compare milestones with prior brief run "${parentBrief.question}" (as_of ${parentBrief.as_of || 'last run'})`
    );
    const slippedQuote = retrieved.find((q) =>
      /\b(?:delayed|postponed|rescheduled|pushed\s+back|slipped|behind\s+schedule|blocked)\b/i.test(q.quote)
    );
    if (slippedQuote) {
      const cleanSnippet = slippedQuote.quote.replace(/[\n\r]+/g, " ").slice(0, 140);
      openLoops.push(`What slipped: ${cleanSnippet}`);
    }
  }

  return {
    title: `Brief: ${question}`,
    sections: {
      summary: summary || "Summary based on provided sources.",
      answer: answerLines || "Summary based on provided sources.",
      what_i_used: {
        private: privateSources,
        web: webSources,
        unchecked: [],
      },
      evidence,
      uncertain: [],
      open_loops: openLoops,
      actions: [],
      what_i_did_not_do: [
        "Did not perform actions without verified user approval.",
      ],
    },
  };
}

export const generateDeterministicDraft = generateDeterministicDraftForEval;
