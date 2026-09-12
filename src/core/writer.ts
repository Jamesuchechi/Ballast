import type {
  BriefMode,
  DraftBrief,
  RetrievedQuote,
} from "./types.js";
import { formatDelimitedSources, type SourceBlock } from "./sourceFormatter.js";

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
    const systemPrompt = `You are the Ballast draft writer. Your job is to draft a structured brief to answer the user's question based strictly on the delimited source data.
Mode: ${mode}.
Rules:
- Do NOT assume external facts not in the sources.
- Cite the relevant quote ID for each evidence claim.
- Output valid JSON matching the DraftBrief structure:
{
  "title": "...",
  "sections": {
    "answer": "...",
    "what_i_used": { "private": [...], "web": [...], "unchecked": [...] },
    "evidence": [{ "claim": "...", "citation_ids": ["..."] }],
    "uncertain": [...],
    "open_loops": [...],
    "actions": [...],
    "what_i_did_not_do": [...]
  }
}`;

    const delimitedSources = formatDelimitedSources(sources);
    const userPrompt = `Question: ${question}\n\nAvailable Sources:\n${delimitedSources}`;

    try {
      const response = await llmCall(userPrompt, systemPrompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as DraftBrief;
      }
    } catch {
      // Fall through to deterministic draft generation on error
    }
  }

  // Deterministic draft generation for testing and fallback
  return generateDeterministicDraft(question, mode, sources, retrieved);
}

/**
 * Deterministic draft generator used for testing, CI fixtures, and fallback.
 */
function generateDeterministicDraft(
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
