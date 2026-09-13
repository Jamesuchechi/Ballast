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
  llmCall?: (prompt: string, systemPrompt: string) => Promise<string>;
}

/**
 * Writer module generates a draft brief.
 * IMPORTANT: Writer output is internal and NEVER shown directly to the user (README rule 1).
 * Source corpus is passed ONLY as delimited XML data blocks, never merged into instructions (NFR1.1).
 */
export async function runWriter(options: WriterOptions): Promise<DraftBrief> {
  const { question, mode, sources, retrieved, llmCall } = options;

  if (llmCall) {
    const delimitedSources = formatDelimitedSources(sources);
    const retrievedQuotesList = retrieved
      .map((r) => `[Quote ID: ${r.id}] (Source: ${r.source_id}, Class: ${r.source_class})\n"${r.quote}"`)
      .join("\n\n");

    const systemPrompt = `You are the Ballast draft writer. Your job is to draft a structured brief answering the user's question based strictly on the delimited source data and retrieved quotes.
Mode: ${mode}.
Rules:
- Do NOT assume external facts not directly stated in the sources or quotes.
- In "evidence", each claim MUST cite the relevant quote ID(s) from the retrieved quotes.
- What I used: categorize source IDs accurately into private, web, and unchecked.
- Output strictly valid JSON matching the DraftBrief structure:
{
  "title": "Brief: <concise question or title>",
  "sections": {
    "answer": "<grounded factual summary quoting evidence>",
    "what_i_used": { "private": ["source_id_1"], "web": [], "unchecked": [] },
    "evidence": [{ "claim": "<exact factual assertion grounded in quote>", "citation_ids": ["quote_id"] }],
    "uncertain": ["<any gaps or uncertainties>"],
    "open_loops": ["<unresolved items or pending tasks>"],
    "actions": ["<concrete next actions>"],
    "what_i_did_not_do": ["<explicit scope boundaries / actions refused>"]
  }
}`;

    const userPrompt = `Question: ${question}

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

  return generateDeterministicDraftForEval(question, mode, sources, retrieved);
}

/**
 * Deterministic draft generator used ONLY for offline testing, CI fixtures, and eval harness.
 */
export function generateDeterministicDraftForEval(
  question: string,
  mode: BriefMode,
  sources: SourceBlock[],
  retrieved: RetrievedQuote[]
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
        open_loops: [],
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

  return {
    title: `Brief: ${question}`,
    sections: {
      answer: answerLines || "Summary based on provided sources.",
      what_i_used: {
        private: privateSources,
        web: webSources,
        unchecked: [],
      },
      evidence,
      uncertain: [],
      open_loops: [],
      actions: [],
      what_i_did_not_do: [
        "Did not perform actions without verified user approval.",
      ],
    },
  };
}

export const generateDeterministicDraft = generateDeterministicDraftForEval;
