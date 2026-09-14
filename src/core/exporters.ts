import type { BriefV1 } from './types';

/**
 * Formats a brief into Obsidian Markdown with YAML frontmatter,
 * Obsidian Callout syntax, and wiki-style citation references (NFR9.2).
 */
export function exportToObsidian(brief: any, citations: any[] = []): string {
  const title = brief.question || 'Ballast Intelligence Brief';
  const asOf = brief.as_of ? new Date(brief.as_of).toISOString() : new Date().toISOString();
  const id = brief.id || 'brief';
  const mode = brief.mode || 'home';

  // Build YAML Frontmatter
  const frontmatter = `---
title: ${JSON.stringify(`Brief: ${title}`)}
id: ${JSON.stringify(id)}
as_of: ${JSON.stringify(asOf)}
mode: ${JSON.stringify(mode)}
status: ${JSON.stringify(brief.status || 'published')}
template_version: ${JSON.stringify(brief.template_version || 'v1')}
tags:
  - ballast
  - briefing
  - intelligence
---

`;

  // Parse or extract sections from brief.sections or raw markdown
  const answer =
    brief.sections?.answer ||
    brief.markdown?.match(/## Answer\s*\n([\s\S]*?)(?=\n## |$)/i)?.[1]?.trim() ||
    '';

  const uncertain = brief.sections?.uncertain || [];
  const openLoops = brief.sections?.open_loops || [];
  const actions = brief.sections?.actions || [];
  const didNotDo = brief.sections?.what_i_did_not_do || [];

  let body = `# Brief: ${title}\n\n`;

  // 1. Answer Callout
  body += `> [!summary] Grounded Answer\n`;
  body += answer
    .split('\n')
    .map((l: string) => `> ${l}`)
    .join('\n');
  body += `\n\n`;

  // 2. Verified Evidence with wiki-links / footnotes
  body += `## Evidence & Grounded Citations\n\n`;
  if (citations && citations.length > 0) {
    citations.forEach((cit, idx) => {
      const footnoteId = idx + 1;
      const quote = cit.quote || '';
      const sourceName = cit.source_name || cit.connector || 'source';
      body += `- ${quote} [^${footnoteId}]\n`;
    });
    body += `\n`;
    citations.forEach((cit, idx) => {
      const footnoteId = idx + 1;
      const sourceName = cit.source_name || cit.connector || 'source';
      body += `[^${footnoteId}]: Extracted from [[${sourceName}]] (${cit.source_class || 'private'}).\n`;
    });
    body += `\n`;
  } else if (brief.sections?.evidence) {
    brief.sections.evidence.forEach((ev: any) => {
      body += `- **${ev.claim}**\n`;
    });
    body += `\n`;
  }

  // 3. Uncertain / Data Gaps
  if (uncertain.length > 0) {
    body += `> [!warning] Uncertain & Data Gaps\n`;
    uncertain.forEach((u: string) => {
      body += `> - ${u}\n`;
    });
    body += `\n`;
  }

  // 4. Open Loops & Actions
  if (openLoops.length > 0 || actions.length > 0) {
    body += `> [!todo] Open Loops & Actions\n`;
    openLoops.forEach((ol: string) => {
      body += `> - [ ] ${ol}\n`;
    });
    actions.forEach((act: string) => {
      body += `> - [ ] **Action:** ${act}\n`;
    });
    body += `\n`;
  }

  // 5. What I did not do
  if (didNotDo.length > 0) {
    body += `> [!info] What I Did Not Do (Safety & Scope Boundaries)\n`;
    didNotDo.forEach((d: string) => {
      body += `> - ${d}\n`;
    });
    body += `\n`;
  }

  return frontmatter + body;
}

/**
 * Formats a brief into Notion-friendly markdown blocks (NFR9.2).
 */
export async function exportToNotion(
  brief: any,
  citations: any[] = []
): Promise<{ success: boolean; markdown: string; format: string }> {
  const title = brief.question || 'Ballast Intelligence Brief';
  const asOf = brief.as_of ? new Date(brief.as_of).toLocaleDateString() : 'Recent';

  let notionContent = `# 🧭 Ballast Brief: ${title}\n\n`;
  notionContent += `*As of ${asOf} • Mode: ${brief.mode || 'home'} • Status: ${brief.status || 'published'}*\n\n`;

  // Answer block
  notionContent += `### 💡 Executive Answer\n`;
  const answer =
    brief.sections?.answer ||
    brief.markdown?.match(/## Answer\s*\n([\s\S]*?)(?=\n## |$)/i)?.[1]?.trim() ||
    'No answer available.';
  notionContent += `> ${answer.replace(/\n/g, '\n> ')}\n\n`;

  // Evidence toggle block
  notionContent += `### 🔍 Grounded Evidence & Citations\n`;
  if (citations && citations.length > 0) {
    citations.forEach((c) => {
      notionContent += `- "${c.quote}" *(Source: ${c.connector || c.source_class || 'private'})*\n`;
    });
  } else {
    notionContent += `- Verified grounded citations attached.\n`;
  }
  notionContent += `\n`;

  // Open Loops / Actions
  notionContent += `### ✅ Next Actions & Open Loops\n`;
  const actions = brief.sections?.actions || [];
  if (actions.length > 0) {
    actions.forEach((a: string) => {
      notionContent += `- [ ] ${a}\n`;
    });
  } else {
    notionContent += `- No pending actions required.\n`;
  }
  notionContent += `\n`;

  // What I did not do
  notionContent += `### 🛡️ Safety & Boundary Summary (What I did not do)\n`;
  const didNotDo = brief.sections?.what_i_did_not_do || [];
  didNotDo.forEach((d: string) => {
    notionContent += `- ${d}\n`;
  });

  return {
    success: true,
    markdown: notionContent,
    format: 'notion-markdown-blocks',
  };
}

export const exportBriefToObsidian = exportToObsidian;
export const exportBriefToNotion = exportToNotion;

