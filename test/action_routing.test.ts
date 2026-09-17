import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseProposedAction } from '../src/core/actionExecutor';

describe('Action parsing & routing suite (Task D2)', () => {
  describe('Email draft action routing', () => {
    test('parses structured email_draft with key-value syntax', () => {
      const parsed = parseProposedAction('email_draft: to=alice@example.com subject="Q3 Review" body="Please find attached summary"');
      assert.equal(parsed.type, 'email_draft');
      assert.equal(parsed.payload.to, 'alice@example.com');
      assert.equal(parsed.payload.subject, 'Q3 Review');
      assert.equal(parsed.payload.body, 'Please find attached summary');
      assert.equal(parsed.payload.create_draft_only, true);
    });

    test('parses natural language draft email command with email address', () => {
      const parsed = parseProposedAction('Draft email to bob@company.org regarding Q3 financial performance results');
      assert.equal(parsed.type, 'email_draft');
      assert.equal(parsed.payload.to, 'bob@company.org');
      assert.ok(parsed.payload.subject.includes('Q3 financial performance results'));
      assert.ok(parsed.payload.body.includes('Draft email to bob@company.org'));
    });

    test('parses JSON formatted email action', () => {
      const jsonStr = JSON.stringify({
        type: 'email_draft',
        to: 'elena@enterprise.io',
        subject: 'Contract Renewal',
        body: 'Here is the contract update.',
      });
      const parsed = parseProposedAction(jsonStr);
      assert.equal(parsed.type, 'email_draft');
      assert.equal(parsed.payload.to, 'elena@enterprise.io');
      assert.equal(parsed.payload.subject, 'Contract Renewal');
      assert.equal(parsed.payload.body, 'Here is the contract update.');
    });
  });

  describe('GitHub issue draft action routing', () => {
    test('parses structured issue_draft with key-value syntax', () => {
      const parsed = parseProposedAction('issue_draft: repo=ballast/core title="Fix PDF parser memory leak" body="Investigate stream regex"');
      assert.equal(parsed.type, 'issue_draft');
      assert.equal(parsed.payload.repo, 'ballast/core');
      assert.equal(parsed.payload.title, 'Fix PDF parser memory leak');
      assert.equal(parsed.payload.body, 'Investigate stream regex');
    });

    test('parses natural language GitHub issue creation', () => {
      const parsed = parseProposedAction('Create GitHub issue on ballast/os: Support Notion write-back connector');
      assert.equal(parsed.type, 'issue_draft');
      assert.equal(parsed.payload.repo, 'ballast/os');
      assert.ok(parsed.payload.title.includes('Support Notion write-back connector'));
      assert.ok(parsed.payload.body.includes('Action item generated from Ballast brief'));
    });

    test('parses JSON formatted issue action', () => {
      const jsonStr = JSON.stringify({
        type: 'issue_draft',
        repo: 'facebook/react',
        title: 'Upgrade compiler plugins',
        body: 'Migrate to v19 release',
      });
      const parsed = parseProposedAction(jsonStr);
      assert.equal(parsed.type, 'issue_draft');
      assert.equal(parsed.payload.repo, 'facebook/react');
      assert.equal(parsed.payload.title, 'Upgrade compiler plugins');
      assert.equal(parsed.payload.body, 'Migrate to v19 release');
    });
  });

  describe('GitHub comment draft action routing', () => {
    test('parses structured comment_draft with issue number and body', () => {
      const parsed = parseProposedAction('comment_draft: repo=ballast/core #142 body="Verification passed in CI suite"');
      assert.equal(parsed.type, 'comment_draft');
      assert.equal(parsed.payload.repo, 'ballast/core');
      assert.equal(parsed.payload.issue_number, 142);
      assert.equal(parsed.payload.body, 'Verification passed in CI suite');
    });

    test('parses natural language comment on GitHub issue', () => {
      const parsed = parseProposedAction('Comment on GitHub issue acme/web#88: Completed Myers diff benchmark in 41ms');
      assert.equal(parsed.type, 'comment_draft');
      assert.equal(parsed.payload.repo, 'acme/web');
      assert.equal(parsed.payload.issue_number, 88);
      assert.ok(parsed.payload.body.includes('Completed Myers diff benchmark in 41ms'));
    });

    test('parses JSON formatted comment action', () => {
      const jsonStr = JSON.stringify({
        type: 'comment_draft',
        repo: 'owner/repo',
        issue_number: 99,
        body: 'LGTM! Ready to merge.',
      });
      const parsed = parseProposedAction(jsonStr);
      assert.equal(parsed.type, 'comment_draft');
      assert.equal(parsed.payload.repo, 'owner/repo');
      assert.equal(parsed.payload.issue_number, 99);
      assert.equal(parsed.payload.body, 'LGTM! Ready to merge.');
    });
  });

  describe('In-app task action routing', () => {
    test('parses prefixed task action', () => {
      const parsed = parseProposedAction('task: Schedule quarterly alignment meeting with engineering leads');
      assert.equal(parsed.type, 'task');
      assert.ok(parsed.payload.task.includes('Schedule quarterly alignment meeting'));
      assert.ok(parsed.payload.summary.includes('Schedule quarterly alignment meeting'));
    });

    test('defaults generic actions safely to task (staying in-app)', () => {
      const parsed = parseProposedAction('Review document version history for Q4 changes');
      assert.equal(parsed.type, 'task');
      assert.ok(parsed.payload.task.includes('Review document version history'));
    });

    test('parses JSON formatted in-app task', () => {
      const jsonStr = JSON.stringify({
        type: 'task',
        title: 'Audit workspace access logs',
        summary: 'Review admin role delegations',
      });
      const parsed = parseProposedAction(jsonStr);
      assert.equal(parsed.type, 'task');
      assert.equal(parsed.payload.title, 'Audit workspace access logs');
      assert.equal(parsed.payload.summary, 'Review admin role delegations');
    });
  });
});
