import { generateBrief } from '../src/core/pipeline';
import { runWriter, generateDeterministicDraftForEval } from '../src/core/writer';
import { assembleBrief } from '../src/core/assembler';
import { renderBriefMarkdown } from '../src/core/renderer';
import { pool, query, queryOne } from '../src/db/client';
import type { RetrievedQuote, CriticOutput } from '../src/core/types';
import type { SourceBlock } from '../src/core/sourceFormatter';

async function runTest() {
  console.log('=== Ballast E1: Brief Summarization / TL;DR Mode Test Suite ===\n');

  try {
    // ----------------------------------------------------
    // Test 1: Deterministic Writer Draft Summary Generation
    // ----------------------------------------------------
    console.log('[Test 1] Testing Writer draft TL;DR summary generation...');
    const dummyQuotes: RetrievedQuote[] = [
      {
        id: 'quote_1',
        source_id: 'src_doc_1',
        source_class: 'private',
        connector: 'drive',
        quote: 'Q3 cloud infrastructure migration completed ahead of schedule with 99.99% uptime.',
      },
      {
        id: 'quote_2',
        source_id: 'src_doc_2',
        source_class: 'private',
        connector: 'github',
        quote: 'Security compliance SOC2 audit passed with zero non-conformities.',
      },
    ];

    const sources: SourceBlock[] = [
      { id: 'src_doc_1', class: 'private', connector: 'drive', body: 'Infrastructure docs' },
      { id: 'src_doc_2', class: 'private', connector: 'github', body: 'Security audit repo' },
    ];

    const draft = generateDeterministicDraftForEval(
      'What is the Q3 migration and compliance status?',
      'home',
      sources,
      dummyQuotes
    );

    if (!draft.sections.summary || draft.sections.summary.length === 0) {
      throw new Error('Writer draft did not generate a summary field');
    }
    console.log(`  Passed: Writer generated draft summary: "${draft.sections.summary}"`);

    // ----------------------------------------------------
    // Test 2: Assembler Grounded Summary Synthesis
    // ----------------------------------------------------
    console.log('\n[Test 2] Testing Assembler grounded summary from Critic keep claims...');
    const criticOut: CriticOutput = {
      keep: [
        {
          claim: 'Q3 cloud infrastructure migration completed ahead of schedule with 99.99% uptime.',
          citation_ids: ['quote_1'],
        },
        {
          claim: 'Security compliance SOC2 audit passed with zero non-conformities.',
          citation_ids: ['quote_2'],
        },
      ],
      drop: [],
      conflicts: [],
      missing: [],
      did_not: ['Did not perform actions without verified user approval.'],
    };

    const assembled = assembleBrief({
      draft,
      criticOut,
      retrieved: dummyQuotes,
      sources,
      question: 'What is the Q3 migration and compliance status?',
      mode: 'home',
    });

    if (!assembled.summary || !assembled.sections.summary) {
      throw new Error('Assembled brief did not produce a summary');
    }
    if (!assembled.summary.includes('migration completed') || !assembled.summary.includes('SOC2 audit')) {
      throw new Error(`Summary is not grounded in keep claims: ${assembled.summary}`);
    }
    console.log(`  Passed: Assembler produced grounded TL;DR: "${assembled.summary}"`);

    // ----------------------------------------------------
    // Test 3: Empty Evidence Path Summary Behavior
    // ----------------------------------------------------
    console.log('\n[Test 3] Testing empty-evidence path summary behavior...');
    const emptyCriticOut: CriticOutput = {
      keep: [],
      drop: [],
      conflicts: [],
      missing: [{ gap: 'No infrastructure documents found.' }],
      did_not: ['Did not hallucinate facts absent from sources.'],
    };

    const emptyDraft = generateDeterministicDraftForEval(
      'Unknown question',
      'home',
      [],
      []
    );

    const emptyAssembled = assembleBrief({
      draft: emptyDraft,
      criticOut: emptyCriticOut,
      retrieved: [],
      sources: [],
      question: 'Unknown question',
      mode: 'home',
    });

    if (!emptyAssembled.summary || !emptyAssembled.summary.includes('No grounded information found')) {
      throw new Error(`Unexpected empty evidence summary: ${emptyAssembled.summary}`);
    }
    console.log(`  Passed: Empty evidence summary safely refused: "${emptyAssembled.summary}"`);

    // ----------------------------------------------------
    // Test 4: Markdown Rendering with TL;DR Callout & Mandatory Headings
    // ----------------------------------------------------
    console.log('\n[Test 4] Testing Markdown rendering with TL;DR callout and claim spans...');
    const rendered = renderBriefMarkdown({
      title: 'Brief: Q3 Status',
      as_of: '2026-09-17T00:00:00Z',
      mode: 'home',
      status: 'published',
      sections: assembled.sections,
    });

    if (!rendered.markdown.includes('> **TL;DR:**')) {
      throw new Error('Rendered markdown missing > **TL;DR:** callout block');
    }
    if (!rendered.markdown.includes('## Answer') || !rendered.markdown.includes('## Evidence')) {
      throw new Error('Rendered markdown lost mandatory headings');
    }
    console.log('  Passed: Markdown includes TL;DR callout while maintaining mandatory headings and structure.');

    // ----------------------------------------------------
    // Test 5: Full Pipeline with Schema Validation
    // ----------------------------------------------------
    console.log('\n[Test 5] Testing full pipeline generateBrief with BriefV1 schema validation...');
    process.env.EVAL_USE_MOCK = 'true';
    const pipelineRes = await generateBrief({
      question: 'Summarize Q3 deployment milestones and compliance',
      mode: 'home',
      sources,
      retrieved: dummyQuotes,
    });

    if (!pipelineRes.success || !pipelineRes.brief.summary) {
      throw new Error(`Pipeline failed or missing summary: ${JSON.stringify(pipelineRes)}`);
    }
    console.log(`  Passed: Pipeline generated valid BriefV1 with summary: "${pipelineRes.brief.summary}"`);

    // ----------------------------------------------------
    // Test 6: Database Persistence of Summary Column
    // ----------------------------------------------------
    console.log('\n[Test 6] Testing PostgreSQL summary column persistence and query retrieval...');
    const wsRes = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name, plan)
      VALUES ('E1 Summary Test Workspace', 'pro')
      RETURNING id;
    `);
    const wsId = wsRes.rows[0].id;

    const briefRes = await pool.query<{ id: string; summary: string }>(`
      INSERT INTO briefs (workspace_id, question, mode, status, summary, template_version)
      VALUES ($1, 'Q3 Migration query', 'home', 'published', $2, 'v1')
      RETURNING id, summary;
    `, [wsId, assembled.summary]);

    const createdBriefId = briefRes.rows[0].id;
    if (briefRes.rows[0].summary !== assembled.summary) {
      throw new Error('Inserted summary does not match assembled summary in DB');
    }

    const fetchedBrief = await queryOne<{ id: string; summary: string }>(
      `SELECT id, summary FROM briefs WHERE id = $1 AND workspace_id = $2`,
      [createdBriefId, wsId]
    );

    if (fetchedBrief?.summary !== assembled.summary) {
      throw new Error(`Queried brief summary mismatch: got ${fetchedBrief?.summary}`);
    }
    console.log(`  Passed: PostgreSQL briefs.summary persisted and retrieved faithfully.`);

    // Cleanup
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [wsId]);
    console.log('  Cleaned up test workspace.');

    console.log('\n[PASS] All E1 Brief Summarization / TL;DR tests passed successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('[FAIL] E1 test failed:', err);
  process.exit(1);
});
