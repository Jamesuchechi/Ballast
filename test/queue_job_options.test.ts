import { DEFAULT_BRIEF_JOB_OPTIONS, getBriefQueue, closeBriefQueue } from '../src/queue/briefQueue';
import { DEFAULT_ACTION_JOB_OPTIONS, getActionQueue, closeActionQueue } from '../src/queue/actionQueue';

async function runTest() {
  console.log('=== Ballast D10: BullMQ Job Options Test Suite ===\n');

  try {
    console.log('[Test 1] Verifying DEFAULT_BRIEF_JOB_OPTIONS configuration...');
    if (DEFAULT_BRIEF_JOB_OPTIONS.attempts !== 3) {
      throw new Error(`Expected briefQueue attempts to be 3, got ${DEFAULT_BRIEF_JOB_OPTIONS.attempts}`);
    }
    if (DEFAULT_BRIEF_JOB_OPTIONS.backoff.type !== 'exponential' || DEFAULT_BRIEF_JOB_OPTIONS.backoff.delay !== 5000) {
      throw new Error(
        `Expected briefQueue exponential backoff with 5000ms delay, got ${JSON.stringify(DEFAULT_BRIEF_JOB_OPTIONS.backoff)}`
      );
    }
    if (DEFAULT_BRIEF_JOB_OPTIONS.removeOnComplete.count !== 100) {
      throw new Error(
        `Expected briefQueue removeOnComplete.count = 100, got ${DEFAULT_BRIEF_JOB_OPTIONS.removeOnComplete.count}`
      );
    }
    if (DEFAULT_BRIEF_JOB_OPTIONS.removeOnFail.count !== 200) {
      throw new Error(
        `Expected briefQueue removeOnFail.count = 200, got ${DEFAULT_BRIEF_JOB_OPTIONS.removeOnFail.count}`
      );
    }
    console.log('  Passed: DEFAULT_BRIEF_JOB_OPTIONS configured with 3 attempts, 5s exponential backoff, and retention cleanup.');

    console.log('\n[Test 2] Verifying DEFAULT_ACTION_JOB_OPTIONS configuration...');
    if (DEFAULT_ACTION_JOB_OPTIONS.attempts !== 3) {
      throw new Error(`Expected actionQueue attempts to be 3, got ${DEFAULT_ACTION_JOB_OPTIONS.attempts}`);
    }
    if (DEFAULT_ACTION_JOB_OPTIONS.backoff.type !== 'exponential' || DEFAULT_ACTION_JOB_OPTIONS.backoff.delay !== 5000) {
      throw new Error(
        `Expected actionQueue exponential backoff with 5000ms delay, got ${JSON.stringify(DEFAULT_ACTION_JOB_OPTIONS.backoff)}`
      );
    }
    if (DEFAULT_ACTION_JOB_OPTIONS.removeOnComplete.count !== 100) {
      throw new Error(
        `Expected actionQueue removeOnComplete.count = 100, got ${DEFAULT_ACTION_JOB_OPTIONS.removeOnComplete.count}`
      );
    }
    if (DEFAULT_ACTION_JOB_OPTIONS.removeOnFail.count !== 200) {
      throw new Error(
        `Expected actionQueue removeOnFail.count = 200, got ${DEFAULT_ACTION_JOB_OPTIONS.removeOnFail.count}`
      );
    }
    console.log('  Passed: DEFAULT_ACTION_JOB_OPTIONS configured with 3 attempts, 5s exponential backoff, and retention cleanup.');

    console.log('\n[Test 3] Verifying BullMQ Queue instance defaultJobOptions...');
    const briefQueue = getBriefQueue();
    const actionQueue = getActionQueue();

    if (briefQueue.defaultJobOptions.attempts !== 3) {
      throw new Error('briefQueue instance missing default attempts = 3');
    }
    if (actionQueue.defaultJobOptions.attempts !== 3) {
      throw new Error('actionQueue instance missing default attempts = 3');
    }
    console.log('  Passed: BullMQ queue instances initialized with defaultJobOptions.');

    console.log('\n[PASS] All D10 BullMQ queue job options verified successfully!\n');
  } finally {
    await closeBriefQueue().catch(() => {});
    await closeActionQueue().catch(() => {});
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error('[FAIL] D10 test failed:', err);
  process.exit(1);
});
