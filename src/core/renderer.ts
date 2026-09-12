import type { PublishedBriefSections, BriefMode, ClaimSpan } from "./types.js";

export interface RenderInput {
  title: string;
  as_of: string;
  mode: BriefMode;
  status: string;
  sections: PublishedBriefSections;
}

export interface RenderResult {
  markdown: string;
  claimSpans: Map<string, ClaimSpan>; // claim text -> span in markdown
}

/**
 * Renders brief sections into the frozen template v1 markdown.
 * Pure function: Does NOT call models. Computes character claim_spans directly
 * into the published markdown string.
 */
export function renderBriefMarkdown(input: RenderInput): RenderResult {
  const lines: string[] = [];

  // Header
  lines.push(`# ${input.title}`);
  lines.push("");
  lines.push(`As of: ${input.as_of}`);
  lines.push(`Mode: ${input.mode}`);
  lines.push(`Status: ${input.status}`);
  lines.push("");

  // Answer
  lines.push("## Answer");
  lines.push(input.sections.answer.trim());
  lines.push("");

  // What I used
  lines.push("## What I used");
  lines.push("### Private");
  if (input.sections.what_i_used.private.length > 0) {
    for (const item of input.sections.what_i_used.private) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- None");
  }

  lines.push("### Web");
  if (input.sections.what_i_used.web.length > 0) {
    for (const item of input.sections.what_i_used.web) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- None");
  }

  lines.push("### Could not be checked");
  if (input.sections.what_i_used.unchecked.length > 0) {
    for (const item of input.sections.what_i_used.unchecked) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- None");
  }
  lines.push("");

  // Evidence
  lines.push("## Evidence");
  const claimSpans = new Map<string, ClaimSpan>();

  if (input.sections.evidence.length > 0) {
    for (const item of input.sections.evidence) {
      const claimPrefix = "- Claim: ";
      const claimLine = `${claimPrefix}${item.claim}`;
      
      // Calculate start and end offset for the claim text
      const currentDocLength = lines.join("\n").length + 1; // +1 for the upcoming newline
      const claimStart = currentDocLength + claimPrefix.length;
      const claimEnd = claimStart + item.claim.length;
      
      claimSpans.set(item.claim, { start: claimStart, end: claimEnd });
      
      lines.push(claimLine);
      for (const cit of item.citations) {
        const sourcePointer = cit.source_id || (cit.source_class === "web" ? cit.url : "system");
        lines.push(`  - [${cit.source_class}] ${sourcePointer} — “${cit.quote}”`);
      }
    }
  } else {
    lines.push("- No grounded evidence claims published.");
  }
  lines.push("");

  // Uncertain / missing
  lines.push("## Uncertain / missing");
  if (input.sections.uncertain.length > 0) {
    for (const item of input.sections.uncertain) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- None identified.");
  }
  lines.push("");

  // Open loops
  lines.push("## Open loops");
  if (input.sections.open_loops.length > 0) {
    for (const item of input.sections.open_loops) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- None.");
  }
  lines.push("");

  // Actions
  lines.push("## Actions");
  if (input.sections.actions.length > 0) {
    for (const item of input.sections.actions) {
      lines.push(`- [ ] ${item}`);
    }
  } else {
    lines.push("- No actions proposed.");
  }
  lines.push("");

  // What I did not do (MANDATORY heading)
  lines.push("## What I did not do");
  if (input.sections.what_i_did_not_do.length > 0) {
    for (const item of input.sections.what_i_did_not_do) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- No additional withheld actions.");
  }
  lines.push("");

  const markdown = lines.join("\n");
  return { markdown, claimSpans };
}
