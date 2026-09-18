import type { RetrievedQuote, SourceBlock } from "./types";

export type { SourceBlock };

/**
 * Formats source blocks into XML-delimited strings to strictly isolate
 * untrusted corpus data from instructions (NFR1.1).
 */
export function formatDelimitedSources(sources: SourceBlock[]): string {
  return sources
    .map(
      (src) =>
        `<source id="${escapeAttr(src.id)}" class="${escapeAttr(
          src.class
        )}" connector="${escapeAttr(src.connector)}" trust="${escapeAttr(
          src.trust_boundary || 'untrusted_content'
        )}">\n${src.body}\n</source>`
    )
    .join("\n\n");
}

/**
 * Formats retrieved quotes into XML-delimited payload for models.
 */
export function formatRetrievedQuotes(quotes: RetrievedQuote[]): string {
  return quotes
    .map(
      (q) =>
        `<quote id="${escapeAttr(q.id)}" source_id="${escapeAttr(
          q.source_id
        )}" class="${escapeAttr(q.source_class)}" connector="${escapeAttr(
          q.connector
        )}" trust="${escapeAttr(q.trust_boundary || 'untrusted_content')}">\n${q.quote}\n</quote>`
    )
    .join("\n\n");
}

function escapeAttr(val: string): string {
  return val.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
