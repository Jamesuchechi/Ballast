import crypto from 'crypto';
import { query } from '@/db/client';
import { renderBriefMarkdown } from '@/core/renderer';
import { validateForPublish } from '@/core/validator';
import { renderAndStorePdf } from '@/core/pdfRenderer';
import type { PublishedEvidenceItem, PublishedBriefSections } from '@/core/types';

export interface SeedBriefResult {
  briefId: string;
  sourceId: string;
  pdfUri: string;
  markdown: string;
}

export async function seedCanonicalBrief(workspaceId: string): Promise<SeedBriefResult> {
  const briefId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const title = 'Q3 Billing Revamp Status & Outstanding Deliverables';
  const asOf = new Date().toISOString();
  const question = 'What are the outstanding deliverables and open questions for the Q3 billing revamp?';

  // 1. Insert Source
  await query(
    `INSERT INTO sources (id, workspace_id, connector, external_id, checksum, trust_boundary, meta)
     VALUES ($1, $2, 'upload', 'seed_doc_billing_01', $3, 'untrusted_content', $4)
     ON CONFLICT (id) DO NOTHING`,
    [
      sourceId,
      workspaceId,
      crypto.createHash('sha256').update('seed_source_content').digest('hex'),
      JSON.stringify({ filename: 'q3_billing_notes.md', mime: 'text/markdown' }),
    ]
  );

  // 2. Prepare Sections
  const evidenceItems: PublishedEvidenceItem[] = [
    {
      claim: 'The new Stripe webhook handler is deployed to staging and passing integration checks.',
      citations: [
        {
          source_class: 'private',
          citation_type: 'support',
          quote: 'The new Stripe webhook handler is deployed to staging and passing integration checks.',
          source_id: sourceId,
          url: null,
        },
      ],
    },
    {
      claim: 'Alex needs to confirm the merchant accounts configuration in the new Stripe dashboard.',
      citations: [
        {
          source_class: 'private',
          citation_type: 'support',
          quote: 'Alex needs to confirm the merchant accounts configuration in the new Stripe dashboard.',
          source_id: sourceId,
          url: null,
        },
      ],
    },
    {
      claim: 'Legal review from Elena is pending before auto-debit can be enabled in production.',
      citations: [
        {
          source_class: 'private',
          citation_type: 'support',
          quote: 'Legal review from Elena is pending before auto-debit can be enabled in production.',
          source_id: sourceId,
          url: null,
        },
      ],
    },
    {
      claim: 'Database migration scripts for subscriber tiers are ready for replica dry run.',
      citations: [
        {
          source_class: 'private',
          citation_type: 'support',
          quote: 'Database migration scripts for subscriber tiers are ready for replica dry run.',
          source_id: sourceId,
          url: null,
        },
      ],
    },
  ];

  const sections: PublishedBriefSections = {
    answer: `- The new Stripe webhook handler is deployed to staging and passing integration checks.
- Alex needs to confirm the merchant accounts configuration in the new Stripe dashboard.
- Legal review from Elena is pending before auto-debit can be enabled in production.
- Database migration scripts for subscriber tiers are ready for replica dry run.`,
    what_i_used: {
      private: ['q3_billing_notes.md'],
      web: [],
      unchecked: [],
    },
    evidence: evidenceItems,
    uncertain: ['Target production rollout date depends on completion of legal signoff.'],
    open_loops: ['Follow up with Elena regarding revised consumer terms of service.'],
    actions: ['Draft email to Elena (Legal) requesting review status.'],
    what_i_did_not_do: [
      'Did not enable production auto-debit flag.',
      'Did not run database migration on primary cluster.',
    ],
  };

  // 3. Render Markdown & Claim Spans
  const renderRes = renderBriefMarkdown({
    title,
    as_of: asOf,
    mode: 'home',
    status: 'published',
    sections,
  });

  // Assign claim spans to citations
  for (const item of evidenceItems) {
    const span = renderRes.claimSpans.get(item.claim);
    if (span) {
      for (const cit of item.citations) {
        cit.claim_span = span;
      }
    }
  }

  // 4. Validate before publish
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
    mode: 'home',
    criticOutput,
    evidence: evidenceItems,
    unchecked: [],
    sections,
  });

  if (!validation.valid) {
    throw new Error(`Validation failed for seed brief: ${validation.errors.join('; ')}`);
  }

  // 5. Render and store PDF
  const pdfUri = await renderAndStorePdf(briefId, title, renderRes.markdown);

  // 6. Insert Brief
  await query(
    `INSERT INTO briefs (
      id, workspace_id, question, mode, status, markdown, pdf_uri, as_of, 
      stale_after, progress, published_at, template_version
    ) VALUES ($1, $2, $3, 'home', 'published', $4, $5, $6, $7, $8, NOW(), 'v1')`,
    [
      briefId,
      workspaceId,
      question,
      renderRes.markdown,
      pdfUri,
      asOf,
      new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      JSON.stringify([
        { step: 'queued', state: 'done' },
        { step: 'retrieving_private', state: 'done' },
        { step: 'drafting', state: 'done' },
        { step: 'verifying', state: 'done' },
        { step: 'validating', state: 'done' },
        { step: 'rendering', state: 'done' },
        { step: 'published', state: 'done' },
      ]),
    ]
  );

  // 7. Insert Citations
  for (const item of evidenceItems) {
    for (const cit of item.citations) {
      await query(
        `INSERT INTO citations (
          workspace_id, brief_id, source_class, citation_type, claim_span, quote, source_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workspaceId,
          briefId,
          cit.source_class,
          cit.citation_type,
          JSON.stringify(cit.claim_span),
          cit.quote,
          cit.source_id,
        ]
      );
    }
  }

  // 8. Insert Action
  await query(
    `INSERT INTO actions (workspace_id, brief_id, type, payload)
     VALUES ($1, $2, 'email_draft', $3)`,
    [
      workspaceId,
      briefId,
      JSON.stringify({
        to: 'elena@internal-legal.co',
        subject: 'Q3 Billing Revamp — Consumer Terms Review Follow-up',
        body: 'Hi Elena,\n\nFollowing up on the Q3 billing revamp terms of service review. We have completed staging verification for the Stripe webhook handler and replica dry runs. Could you please provide an estimated review completion date so we can plan the production launch?\n\nBest,\nEngineering',
      }),
    ]
  );

  // 9. Insert Run
  await query(
    `INSERT INTO runs (workspace_id, brief_id, tools_called, tokens_in, tokens_out, latency_ms, cost, critic_log)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      workspaceId,
      briefId,
      JSON.stringify(['search_private_chunks', 'read_snapshot']),
      1840,
      412,
      940,
      0.0042,
      JSON.stringify(criticOutput),
    ]
  );

  return {
    briefId,
    sourceId,
    pdfUri,
    markdown: renderRes.markdown,
  };
}
