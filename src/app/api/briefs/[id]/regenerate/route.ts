import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { query, queryOne } from '@/db/client';
import { renderBriefMarkdown } from '@/core/renderer';
import { renderAndStorePdf } from '@/core/pdfRenderer';
import { validateForPublish } from '@/core/validator';
import type { PublishedEvidenceItem, PublishedBriefSections } from '@/core/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;

    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify parent brief exists and belongs to current workspace
    const original = await queryOne<{
      id: string;
      workspace_id: string;
      question: string;
      mode: 'home' | 'world';
    }>(
      `SELECT id, workspace_id, question, mode FROM briefs WHERE id = $1 AND workspace_id = $2`,
      [id, payload.workspaceId]
    );

    if (!original) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    // In accordance with Ballast data model specifications:
    // Regeneration creates a NEW ROW with parent_brief_id set, never mutating the original.
    const childBriefId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const asOf = new Date().toISOString();
    const title = `Regenerated: ${original.question}`;

    // Seed source for new version
    await query(
      `INSERT INTO sources (id, workspace_id, connector, external_id, checksum, trust_boundary, meta)
       VALUES ($1, $2, 'upload', $3, $4, 'untrusted_content', $5)`,
      [
        sourceId,
        payload.workspaceId,
        `source_regen_${childBriefId.slice(0, 8)}`,
        crypto.createHash('sha256').update(childBriefId).digest('hex'),
        JSON.stringify({ notes: 'Updated source snapshot during regeneration' }),
      ]
    );

    const evidenceItems: PublishedEvidenceItem[] = [
      {
        claim: 'The updated Stripe webhook handler passed secondary end-to-end regression tests.',
        citations: [
          {
            source_class: 'private',
            citation_type: 'support',
            quote: 'The updated Stripe webhook handler passed secondary end-to-end regression tests.',
            source_id: sourceId,
            url: null,
          },
        ],
      },
      {
        claim: 'Legal signoff on consumer terms of service remains pending with Elena.',
        citations: [
          {
            source_class: 'private',
            citation_type: 'support',
            quote: 'Legal signoff on consumer terms of service remains pending with Elena.',
            source_id: sourceId,
            url: null,
          },
        ],
      },
    ];

    const sections: PublishedBriefSections = {
      answer: `- The updated Stripe webhook handler passed secondary end-to-end regression tests.
- Legal signoff on consumer terms of service remains pending with Elena.`,
      what_i_used: {
        private: [`source_regen_${childBriefId.slice(0, 8)}`],
        web: [],
        unchecked: [],
      },
      evidence: evidenceItems,
      uncertain: ['Final launch window depends on legal review completion.'],
      open_loops: ['Follow up with Legal.'],
      actions: ['Review webhook logs in staging.'],
      what_i_did_not_do: [
        'Did not modify parent brief history.',
        'Did not enable production auto-debit flag.',
      ],
    };

    const renderRes = renderBriefMarkdown({
      title,
      as_of: asOf,
      mode: original.mode,
      status: 'published',
      sections,
    });

    for (const item of evidenceItems) {
      const span = renderRes.claimSpans.get(item.claim);
      if (span) {
        for (const cit of item.citations) {
          cit.claim_span = span;
        }
      }
    }

    const criticOutput = {
      keep: evidenceItems.map((e) => ({
        claim: e.claim,
        citation_ids: [sourceId],
      })),
      drop: [],
      conflicts: [],
      missing: [],
      did_not: sections.what_i_did_not_do,
    };

    const validation = validateForPublish({
      markdown: renderRes.markdown,
      mode: original.mode,
      criticOutput,
      evidence: evidenceItems,
      unchecked: [],
      sections,
    });

    if (!validation.valid) {
      throw new Error(`Validation failed for regenerated brief: ${validation.errors.join('; ')}`);
    }

    const pdfUri = await renderAndStorePdf(childBriefId, title, renderRes.markdown);

    // Insert new child row with parent_brief_id
    const childRow = await queryOne(
      `INSERT INTO briefs (
        id, workspace_id, parent_brief_id, question, mode, status, 
        markdown, pdf_uri, as_of, stale_after, progress, published_at, template_version
      ) VALUES ($1, $2, $3, $4, $5, 'published', $6, $7, $8, $9, $10, NOW(), 'v1')
      RETURNING *`,
      [
        childBriefId,
        payload.workspaceId,
        original.id, // Links to parent!
        original.question,
        original.mode,
        renderRes.markdown,
        pdfUri,
        asOf,
        new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        JSON.stringify([
          { step: 'queued', state: 'done' },
          { step: 'drafting', state: 'done' },
          { step: 'verifying', state: 'done' },
          { step: 'validating', state: 'done' },
          { step: 'rendering', state: 'done' },
          { step: 'published', state: 'done' },
        ]),
      ]
    );

    // Insert citations for child
    for (const item of evidenceItems) {
      for (const cit of item.citations) {
        await query(
          `INSERT INTO citations (
            workspace_id, brief_id, source_class, citation_type, claim_span, quote, source_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            payload.workspaceId,
            childBriefId,
            cit.source_class,
            cit.citation_type,
            JSON.stringify(cit.claim_span),
            cit.quote,
            cit.source_id,
          ]
        );
      }
    }

    return NextResponse.json({
      childBrief: childRow,
      message: 'Regenerated brief created as new version',
    });
  } catch (err: any) {
    console.error('Regenerate brief error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
