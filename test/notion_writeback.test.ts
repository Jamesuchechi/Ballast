process.env.NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildNotionBlockChildren, pushBriefToNotion, exportToNotion } from '../src/core/exporters';
import { query, queryOne } from '../src/db/client';

describe('Feature E14: Notion Write-Back / Export', () => {
  it('buildNotionBlockChildren converts brief sections into valid Notion API block objects', () => {
    const mockBrief = {
      id: randomUUID(),
      title: 'Quarterly Cloud Architecture Strategy',
      question: 'What are the core findings and migration action items?',
      created_at: '2026-09-18T10:00:00Z',
      sections: {
        summary: 'Cloud migration is on schedule with 99.99% availability achieved.',
        answer: 'All primary services have successfully transitioned to regional clusters.\nNetwork egress costs decreased by 18%.',
        actions: ['Update Terraform state locks', 'Schedule DR tabletop exercise'],
        what_i_did_not_do: ['Did not analyze on-prem legacy cold storage archive'],
      },
    };

    const mockCitations = [
      {
        source_id: randomUUID(),
        url: 'https://notion.so/workspace/arch-spec-123',
        source_class: 'private',
        quote: 'Regional multi-zone clustering guarantees 99.99% uptime for core API services.',
      },
      {
        source_id: randomUUID(),
        uri: 'gmail://msg-999',
        source_class: 'private',
        quote: 'Network egress optimization reduced monthly data transfer fees by $12,400.',
      },
    ];

    const blocks = buildNotionBlockChildren(mockBrief, mockCitations);

    assert.ok(Array.isArray(blocks), 'Should return an array of blocks');
    assert.ok(blocks.length > 5, 'Should contain metadata callout, answers, citations, actions, and boundaries');

    // 1. Callout verification
    const calloutBlock = blocks.find((b) => b.type === 'callout');
    assert.ok(calloutBlock, 'Should have a top callout block');
    assert.equal(calloutBlock.callout.icon.emoji, '⚡');
    assert.ok(
      calloutBlock.callout.rich_text[0].text.content.includes('Executive Summary'),
      'Callout contains summary header'
    );

    // 2. Headings verification
    const headings = blocks.filter((b) => b.type === 'heading_2');
    assert.ok(headings.some((h) => h.heading_2.rich_text[0].text.content.includes('Grounded Answer')));
    assert.ok(headings.some((h) => h.heading_2.rich_text[0].text.content.includes('Evidence & Citations')));
    assert.ok(headings.some((h) => h.heading_2.rich_text[0].text.content.includes('Recommended Actions')));
    assert.ok(headings.some((h) => h.heading_2.rich_text[0].text.content.includes('Scope Boundaries')));

    // 3. Quotes verification
    const quotes = blocks.filter((b) => b.type === 'quote');
    assert.equal(quotes.length, 2, 'Should format both citations as Notion quote blocks');
    assert.ok(quotes[0].quote.rich_text[0].text.content.includes('Regional multi-zone clustering'));

    // 4. To-Do verification
    const todos = blocks.filter((b) => b.type === 'to_do');
    assert.equal(todos.length, 2, 'Should produce 2 to-do items');
    assert.equal(todos[0].to_do.rich_text[0].text.content, 'Update Terraform state locks');
    assert.equal(todos[0].to_do.checked, false);

    // 5. Scope boundaries list verification
    const listItems = blocks.filter((b) => b.type === 'bulleted_list_item');
    assert.equal(listItems.length, 1);
    assert.ok(listItems[0].bulleted_list_item.rich_text[0].text.content.includes('on-prem legacy cold storage'));

    // 6. Max length check (< 2000 chars per text block)
    for (const block of blocks) {
      const payloadObj = (block as any)[block.type];
      if (payloadObj && payloadObj.rich_text) {
        for (const rt of payloadObj.rich_text) {
          if (rt.text?.content) {
            assert.ok(rt.text.content.length <= 2000, 'Text content must not exceed 2000 Notion limit');
          }
        }
      }
    }
  });

  it('exportToNotion returns formatted markdown blocks with callouts, quotes and checkboxes', async () => {
    const brief = {
      id: randomUUID(),
      title: 'Infrastructure Sync',
      created_at: new Date().toISOString(),
      sections: {
        summary: 'Infra sync completed.',
        answer: 'Redis cluster scaled to 3 nodes.',
        actions: ['Monitor memory usage'],
      },
    };

    const res = await exportToNotion(brief, []);
    assert.equal(res.format, 'notion_blocks');
    assert.ok(res.markdown.includes('> 🧭 **Ballast Intelligence Brief**'));
    assert.ok(res.markdown.includes('## 💡 Grounded Answer'));
    assert.ok(res.markdown.includes('- [ ] Monitor memory usage'));
  });

  it('pushBriefToNotion writes back live/mock Notion page and records audit access log', async () => {
    // 1. Create a test workspace & brief in local DB
    const workspaceId = randomUUID();
    await query(
      `INSERT INTO workspaces (id, name, created_at)
       VALUES ($1, 'Notion Test Workspace', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [workspaceId]
    );

    const briefId = randomUUID();
    await query(
      `INSERT INTO briefs (id, workspace_id, question, status, summary, markdown, created_at)
       VALUES ($1, $2, $3, 'published', $4, $5, NOW())`,
      [
        briefId,
        workspaceId,
        'How does Notion write-back integrate with Ballast?',
        'Notion write-back converts published briefs into native Notion API blocks.',
        '# Notion Integration Brief\n\n## Answer\nAll evidence citations, actions, and scope boundaries become native pages.',
      ]
    );

    // 2. Execute pushBriefToNotion in test/mock mode
    const result = await pushBriefToNotion({
      workspaceId,
      brief: {
        id: briefId,
        title: 'Notion Integration Brief',
        question: 'How does Notion write-back integrate with Ballast?',
        sections: {
          summary: 'Notion write-back converts published briefs into native Notion API blocks.',
          answer: 'All evidence citations, actions, and scope boundaries become native pages.',
          actions: ['Review created Notion page'],
        },
      },
      citations: [
        {
          source_id: randomUUID(),
          source_class: 'private',
          quote: 'Native Notion block transformation guarantees clean hierarchy.',
        },
      ],
    });

    assert.equal(result.success, true);
    assert.ok(result.pageId.startsWith('notion-page-') || result.pageId.length > 0);
    assert.ok(result.url.includes('notion.so'));
    assert.equal(result.title, 'Notion Integration Brief');

    // 3. Verify access audit log insertion
    const log = await queryOne<any>(
      `SELECT * FROM access_logs WHERE workspace_id = $1 AND brief_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, briefId]
    );

    assert.ok(log, 'Access log must be recorded for Notion writeback');
    assert.ok(log.action.includes('notion_writeback_mock') || log.action.includes('notion_writeback_created'));

    // Clean up test workspace
    await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM briefs WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
  });
});
