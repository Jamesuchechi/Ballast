import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderBriefMarkdown } from '../src/core/renderer';
import { cleanHtmlAndTracking, parseAndHumanizeCitationLine, humanizeSourceLabel } from '../src/lib/formatters';
import type { PublishedBriefSections, RetrievedQuote } from '../src/core/types';

describe('Feature E13: Citation Inline Hover Preview & Claim Span Grounding', () => {
  it('computes exact claim_span character offsets in renderer.ts', () => {
    const sections: PublishedBriefSections = {
      summary: 'Q3 revenue grew by 14% year over year.',
      answer: 'The company exceeded quarterly targets across both cloud and enterprise segments.',
      what_i_used: {
        private: ['Q3 Financial Report 2026.pdf'],
        web: [],
        unchecked: [],
      },
      evidence: [
        {
          claim: 'Enterprise segment ARR reached $42M in Q3 2026.',
          citations: [
            {
              source_id: '11111111-2222-3333-4444-555555555555',
              source_class: 'private',
              citation_type: 'support',
              quote: 'Enterprise ARR reached $42M reflecting strong multi-year contract renewals.',
            },
          ],
        },
        {
          claim: 'Cloud gross margin improved by 320 basis points.',
          citations: [
            {
              source_id: '11111111-2222-3333-4444-555555555555',
              source_class: 'private',
              citation_type: 'support',
              quote: 'Cloud GM expanded 320 bps driven by infrastructure optimization.',
            },
          ],
        },
      ],
      uncertain: [],
      open_loops: [],
      actions: ['Schedule follow-up investor briefing'],
      what_i_did_not_do: [],
    };

    const res = renderBriefMarkdown({
      title: 'Q3 Financial Review',
      as_of: '2026-09-18T10:00:00.000Z',
      mode: 'home',
      status: 'published',
      sections,
    });

    assert.ok(res.markdown.includes('# Q3 Financial Review'));
    assert.ok(res.markdown.includes('## Evidence'));
    assert.ok(res.claimSpans instanceof Map);
    assert.equal(res.claimSpans.size, 2);

    const span1 = res.claimSpans.get('Enterprise segment ARR reached $42M in Q3 2026.');
    assert.ok(span1, 'First claim span must exist');
    assert.ok(span1.start > 0);
    assert.ok(span1.end > span1.start);

    // Verify extracted substring in rendered markdown exactly matches the claim text
    const extractedClaim1 = res.markdown.slice(span1.start, span1.end);
    assert.equal(extractedClaim1, 'Enterprise segment ARR reached $42M in Q3 2026.');

    const span2 = res.claimSpans.get('Cloud gross margin improved by 320 basis points.');
    assert.ok(span2, 'Second claim span must exist');
    const extractedClaim2 = res.markdown.slice(span2.start, span2.end);
    assert.equal(extractedClaim2, 'Cloud gross margin improved by 320 basis points.');
  });

  it('correctly parses and humanizes raw citation lines for hover previews', () => {
    const rawLine = '  - [private] 12345678-abcd-1234-abcd-1234567890ab — “Operating expenses remained flat at $18.4M.”';
    const parsed = parseAndHumanizeCitationLine(rawLine);

    assert.equal(parsed.sourceClass, 'private');
    assert.equal(parsed.sourceLabel, 'Your Files');
    assert.equal(parsed.quote, 'Operating expenses remained flat at $18.4M.');
  });

  it('correctly extracts and humanizes web citation lines', () => {
    const rawWebLine = '- [web] https://finance.example.com/press-release/q3-results — “Net income rose to $6.2M.”';
    const parsed = parseAndHumanizeCitationLine(rawWebLine);

    assert.equal(parsed.sourceClass, 'web');
    assert.equal(parsed.sourceLabel, 'finance.example.com');
    assert.equal(parsed.quote, 'Net income rose to $6.2M.');
  });

  it('cleans tracking noise, encoded entities, and machine tokens for quote popovers', () => {
    const dirtyText = '<p>Revenue was &quot;<strong>$50M</strong>&quot; &amp; gross profit was high <style>.hide{display:none}</style></p>';
    const cleaned = cleanHtmlAndTracking(dirtyText);
    assert.equal(cleaned, 'Revenue was "$50M" & gross profit was high');
  });

  it('formats humanized source labels properly across UUIDs, URLs, and filenames', () => {
    // UUID -> Friendly fallback
    assert.equal(humanizeSourceLabel('12345678-1234-1234-1234-1234567890ab', 'private'), 'Your Files');
    assert.equal(humanizeSourceLabel('12345678-1234-1234-1234-1234567890ab', 'web'), 'Web Search Result');

    // URL -> Hostname
    assert.equal(humanizeSourceLabel('https://docs.google.com/document/d/123', 'private'), 'docs.google.com');

    // Filename -> Clean basename
    assert.equal(humanizeSourceLabel('uploads/12345678-1234-1234-1234-1234567890ab_Quarterly_Strategy.pdf', 'private'), 'Quarterly_Strategy.pdf');
  });
});
