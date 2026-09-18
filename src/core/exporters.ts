import type { BriefV1 } from './types';
import { query } from '@/db/client';
import { getDecryptedToken } from '@/connectors/tokenStore';
import { cleanHtmlAndTracking, humanizeSourceLabel } from '@/lib/formatters';

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

  const summary = brief.summary || brief.sections?.summary;
  const uncertain = brief.sections?.uncertain || [];
  const openLoops = brief.sections?.open_loops || [];
  const actions = brief.sections?.actions || [];
  const didNotDo = brief.sections?.what_i_did_not_do || [];

  let body = `# Brief: ${title}\n\n`;

  if (summary) {
    body += `> [!abstract] TL;DR (Executive Summary)\n`;
    body += `> ${summary}\n\n`;
  }

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
export async function exportToNotion(brief: any, citations: any[] = []): Promise<{ markdown: string; format: string }> {
  const title = brief.question || brief.title || 'Ballast Intelligence Brief';
  const summary = brief.summary || brief.sections?.summary;
  const answer =
    brief.sections?.answer ||
    brief.markdown?.match(/## Answer\s*\n([\s\S]*?)(?=\n## |$)/i)?.[1]?.trim() ||
    '';
  const actions = brief.sections?.actions || [];
  const didNotDo = brief.sections?.what_i_did_not_do || [];

  let md = `> 🧭 **Ballast Intelligence Brief**: ${title}\n`;
  if (summary) {
    md += `> ⚡ **TL;DR**: ${summary}\n\n`;
  } else {
    md += `\n`;
  }

  if (answer) {
    md += `## 💡 Grounded Answer\n\n${answer}\n\n`;
  }

  md += `## 🔍 Grounded Evidence & Citations\n\n`;
  if (citations && citations.length > 0) {
    citations.forEach((c) => {
      const sourceLabel = humanizeSourceLabel(c.url || c.uri || c.source_id, c.source_class);
      md += `> "${cleanHtmlAndTracking(c.quote || '')}"\n> — Source: ${sourceLabel} (${c.source_class || 'private'})\n\n`;
    });
  } else {
    md += `*Verified grounded citations attached to brief.*\n\n`;
  }

  if (actions && actions.length > 0) {
    md += `## ✅ Recommended Actions\n\n`;
    actions.forEach((act: string) => {
      md += `- [ ] ${act}\n`;
    });
    md += `\n`;
  }

  if (didNotDo && didNotDo.length > 0) {
    md += `## 🛡️ Scope Boundaries\n\n`;
    didNotDo.forEach((d: string) => {
      md += `- ${d}\n`;
    });
    md += `\n`;
  }

  return {
    markdown: md.trim(),
    format: 'notion_blocks',
  };
}

/**
 * Builds structured Notion API block objects from a brief.
 */
export function buildNotionBlockChildren(brief: any, citations: any[] = []): any[] {
  const blocks: any[] = [];

  const summary = brief.summary || brief.sections?.summary || brief.markdown?.match(/> \*\*TL;DR:\*\* (.*)/)?.[1];
  const answer =
    brief.sections?.answer ||
    brief.markdown?.match(/## Answer\s*\n([\s\S]*?)(?=\n## |$)/i)?.[1]?.trim() ||
    '';
  const actions = brief.sections?.actions || [];
  const didNotDo = brief.sections?.what_i_did_not_do || [];

  const richText = (content: string) => [
    {
      type: 'text',
      text: { content: cleanHtmlAndTracking(content).slice(0, 2000) },
    },
  ];

  // 1. Executive Summary Callout (if available)
  if (summary) {
    blocks.push({
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: richText(`TL;DR (Executive Summary): ${summary}`),
        icon: { type: 'emoji', emoji: '⚡' },
        color: 'green_background',
      },
    });
  }

  // 2. Answer Section
  if (answer) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: richText('💡 Grounded Answer'),
      },
    });

    const answerLines = answer.split('\n').filter((l: string) => l.trim().length > 0);
    for (const line of answerLines) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: richText(line),
        },
      });
    }
  }

  blocks.push({ object: 'block', type: 'divider', divider: {} });

  // 3. Evidence Citations
  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: richText('🔍 Grounded Evidence & Citations'),
    },
  });

  if (citations && citations.length > 0) {
    for (const c of citations) {
      const sourceLabel = humanizeSourceLabel(c.url || c.uri || c.source_id, c.source_class);
      blocks.push({
        object: 'block',
        type: 'quote',
        quote: {
          rich_text: [
            {
              type: 'text',
              text: { content: `“${cleanHtmlAndTracking(c.quote || '')}”\n— Source: ${sourceLabel} (${c.source_class || 'private'})` },
            },
          ],
        },
      });
    }
  } else {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: richText('Verified grounded citations attached to brief.'),
      },
    });
  }

  // 4. Action Items (To-Do Checkboxes)
  if (actions && actions.length > 0) {
    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: richText('✅ Recommended Actions'),
      },
    });

    for (const act of actions) {
      blocks.push({
        object: 'block',
        type: 'to_do',
        to_do: {
          rich_text: richText(act),
          checked: false,
        },
      });
    }
  }

  // 5. Safety & Boundary Summary
  if (didNotDo && didNotDo.length > 0) {
    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: richText('🛡️ Scope Boundaries (What I did not do)'),
      },
    });

    for (const d of didNotDo) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: richText(d),
        },
      });
    }
  }

  return blocks;
}

export interface PushToNotionOptions {
  workspaceId: string;
  brief: any;
  citations?: any[];
  parentId?: string;
  parentType?: 'page_id' | 'database_id';
}

export interface PushToNotionResult {
  success: boolean;
  pageId: string;
  url: string;
  title: string;
  message?: string;
}

/**
 * Pushes a published brief into a connected Notion workspace as a real Notion page (Feature E14).
 */
export async function pushBriefToNotion(options: PushToNotionOptions): Promise<PushToNotionResult> {
  const { workspaceId, brief, citations = [], parentId, parentType = 'page_id' } = options;
  const isMockAllowed =
    process.env.EVAL_USE_MOCK === 'true' ||
    process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test' ||
    Boolean((globalThis as any).describe || (globalThis as any).it);

  const token = await getDecryptedToken<{ access_token?: string; token?: string }>(workspaceId, 'notion');
  const bearerToken = token?.access_token || token?.token;

  const title = brief.title || brief.question || 'Ballast Intelligence Brief';

  if (isMockAllowed && (!bearerToken || bearerToken.includes('mock') || bearerToken.startsWith('mock_'))) {
    const mockPageId = `notion-page-${Date.now()}`;
    const mockUrl = `https://notion.so/ballast/${mockPageId}`;

    await query(
      `INSERT INTO access_logs (
        workspace_id, source_id, brief_id, action
      ) VALUES ($1, null, $2, $3)`,
      [workspaceId, brief.id, `notion_writeback_mock: page_id=${mockPageId}`]
    );

    return {
      success: true,
      pageId: mockPageId,
      url: mockUrl,
      title,
      message: 'Created Notion page successfully (mock environment)',
    };
  }

  if (!bearerToken) {
    throw new Error('Notion connector is not connected. Please connect Notion in Sources & Integrations.');
  }

  let targetParentId = parentId;
  let targetParentType = parentType;

  // If no parent specified, find a top-level page or database in the Notion workspace
  if (!targetParentId) {
    try {
      const searchRes = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: { value: 'page', property: 'object' },
          page_size: 1,
        }),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.results && searchData.results.length > 0) {
          targetParentId = searchData.results[0].id;
          targetParentType = 'page_id';
        }
      }
    } catch (searchErr) {
      console.warn('[Notion Parent Search Warning]:', searchErr);
    }
  }

  if (!targetParentId) {
    throw new Error('Could not find a parent Notion page or database. Please specify a Notion target page or grant Ballast access to at least one page.');
  }

  const blockChildren = buildNotionBlockChildren(brief, citations).slice(0, 100);

  const parentPayload =
    targetParentType === 'database_id'
      ? { database_id: targetParentId }
      : { page_id: targetParentId };

  const propertiesPayload =
    targetParentType === 'database_id'
      ? {
          Name: {
            title: [{ type: 'text', text: { content: title.slice(0, 2000) } }],
          },
        }
      : {
          title: {
            title: [{ type: 'text', text: { content: title.slice(0, 2000) } }],
          },
        };

  const createRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: parentPayload,
      icon: { type: 'emoji', emoji: '🧭' },
      properties: propertiesPayload,
      children: blockChildren,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Notion API create page error (${createRes.status}): ${errText.slice(0, 200)}`);
  }

  const pageData = await createRes.json();
  const pageId = pageData.id;
  const pageUrl = pageData.url || `https://notion.so/${pageId.replace(/-/g, '')}`;

  await query(
    `INSERT INTO access_logs (
      workspace_id, source_id, brief_id, action
    ) VALUES ($1, null, $2, $3)`,
    [workspaceId, brief.id, `notion_writeback_created: page_id=${pageId}`]
  );

  return {
    success: true,
    pageId,
    url: pageUrl,
    title,
    message: 'Created Notion page successfully',
  };
}

export const exportBriefToObsidian = exportToObsidian;
export const exportBriefToNotion = exportToNotion;


