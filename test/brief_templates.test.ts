import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIEF_TEMPLATES,
  TEMPLATE_CATEGORIES,
  queryTemplates,
  getTemplateById,
} from '../src/lib/templates';
import { validateQuestionTemplate, renderQuestionTemplate } from '../src/lib/templateValidator';

describe('Feature E15: Brief Templates Library', () => {
  it('validates template catalog structure and integrity', () => {
    assert.ok(BRIEF_TEMPLATES.length >= 8, 'Must include at least 8 pre-built templates');

    const ids = new Set<string>();

    for (const tpl of BRIEF_TEMPLATES) {
      // 1. ID uniqueness
      assert.ok(tpl.id && tpl.id.trim().length > 0, 'Template ID must be non-empty');
      assert.ok(!ids.has(tpl.id), `Duplicate template ID found: ${tpl.id}`);
      ids.add(tpl.id);

      // 2. Title & Description
      assert.ok(tpl.title && tpl.title.length > 3, `Invalid title for ${tpl.id}`);
      assert.ok(tpl.description && tpl.description.length > 10, `Invalid description for ${tpl.id}`);

      // 3. Category
      assert.ok(
        TEMPLATE_CATEGORIES.includes(tpl.category),
        `Invalid category ${tpl.category} for ${tpl.id}`
      );

      // 4. Suggested mode
      assert.ok(
        tpl.suggestedMode === 'home' || tpl.suggestedMode === 'world',
        `Invalid mode ${tpl.suggestedMode} for ${tpl.id}`
      );

      // 5. Question syntax & tag validity
      assert.ok(tpl.question && tpl.question.length > 15, `Question too short for ${tpl.id}`);
      const validation = validateQuestionTemplate(tpl.question);
      assert.equal(
        validation.valid,
        true,
        `Question for ${tpl.id} failed tag validation: ${validation.errors.join(', ')}`
      );

      // 6. Connectors & tags
      assert.ok(Array.isArray(tpl.connectors) && tpl.connectors.length > 0, `Missing connectors for ${tpl.id}`);
      assert.ok(Array.isArray(tpl.tags) && tpl.tags.length > 0, `Missing tags for ${tpl.id}`);
    }
  });

  it('filters templates by category, mode, and keyword search', () => {
    // Category filtering
    const engTemplates = queryTemplates({ category: 'Engineering & Product' });
    assert.ok(engTemplates.length >= 2);
    assert.ok(engTemplates.every((t) => t.category === 'Engineering & Product'));

    // Mode filtering
    const worldTemplates = queryTemplates({ mode: 'world' });
    assert.ok(worldTemplates.length >= 1);
    assert.ok(worldTemplates.every((t) => t.suggestedMode === 'world'));

    // Search filtering
    const searchStatus = queryTemplates({ search: 'status' });
    assert.ok(searchStatus.some((t) => t.id === 'weekly-team-status'));

    const searchCompetitor = queryTemplates({ search: 'competitor' });
    assert.ok(searchCompetitor.some((t) => t.id === 'competitor-news-scan'));

    const searchPRs = queryTemplates({ search: 'blocker' });
    assert.ok(searchPRs.length >= 1);
  });

  it('retrieves single template by unique ID', () => {
    const tpl = getTemplateById('weekly-team-status');
    assert.ok(tpl);
    assert.equal(tpl?.title, 'Weekly Team Status & Wins');
    assert.equal(tpl?.suggestedMode, 'home');
    assert.equal(tpl?.suggestedCron, '0 9 * * 1');

    const notFound = getTemplateById('non-existent-template-id');
    assert.equal(notFound, undefined);
  });

  it('renders dynamic timezone and date tags correctly in questions', () => {
    const tpl = getTemplateById('executive-daily-standup');
    assert.ok(tpl);
    assert.ok(tpl?.question.includes('{{today}}'));

    const testDate = new Date('2026-09-18T10:30:00Z');
    const rendered = renderQuestionTemplate(tpl!.question, {
      date: testDate,
      timezone: 'UTC',
    });

    assert.ok(!rendered.includes('{{today}}'), 'Template tag must be resolved');
    assert.ok(rendered.includes('2026-09-18'), 'Rendered question should contain formatted date');
  });
});
