import { strict as assert } from 'assert';
import { computeLineDiff } from '../src/core/diff';

async function runTests() {
  console.log('=== Ballast Myers Diff Algorithm Test Suite (Bug 10) ===\n');

  // Test 1: Identical text
  console.log('[Test 1] Testing identical text...');
  const text1 = 'Line 1\nLine 2\nLine 3';
  const diff1 = computeLineDiff(text1, text1);
  assert.equal(diff1.length, 3);
  assert.deepEqual(diff1.map(d => d.type), ['same', 'same', 'same']);
  assert.deepEqual(diff1.map(d => d.text), ['Line 1', 'Line 2', 'Line 3']);
  console.log('  Passed: Identical lines correctly identified as "same".');

  // Test 2: Additions only
  console.log('[Test 2] Testing additions...');
  const oldText2 = 'Line 1\nLine 3';
  const newText2 = 'Line 1\nLine 2\nLine 3';
  const diff2 = computeLineDiff(oldText2, newText2);
  assert.equal(diff2.length, 3);
  assert.equal(diff2[0].type, 'same');
  assert.equal(diff2[0].text, 'Line 1');
  assert.equal(diff2[1].type, 'add');
  assert.equal(diff2[1].text, 'Line 2');
  assert.equal(diff2[2].type, 'same');
  assert.equal(diff2[2].text, 'Line 3');
  console.log('  Passed: Added line correctly positioned and tagged.');

  // Test 3: Deletions only
  console.log('[Test 3] Testing deletions...');
  const oldText3 = 'Line 1\nLine 2\nLine 3';
  const newText3 = 'Line 1\nLine 3';
  const diff3 = computeLineDiff(oldText3, newText3);
  assert.equal(diff3.length, 3);
  assert.equal(diff3[0].type, 'same');
  assert.equal(diff3[0].text, 'Line 1');
  assert.equal(diff3[1].type, 'del');
  assert.equal(diff3[1].text, 'Line 2');
  assert.equal(diff3[2].type, 'same');
  assert.equal(diff3[2].text, 'Line 3');
  console.log('  Passed: Deleted line correctly positioned and tagged.');

  // Test 4: Line replacements / modifications
  console.log('[Test 4] Testing line replacements...');
  const oldText4 = 'Line 1\nOld Line 2\nLine 3';
  const newText4 = 'Line 1\nNew Line 2\nLine 3';
  const diff4 = computeLineDiff(oldText4, newText4);
  assert.equal(diff4.length, 4);
  assert.equal(diff4[0].type, 'same');
  assert.equal(diff4[1].type, 'del');
  assert.equal(diff4[1].text, 'Old Line 2');
  assert.equal(diff4[2].type, 'add');
  assert.equal(diff4[2].text, 'New Line 2');
  assert.equal(diff4[3].type, 'same');
  console.log('  Passed: Modified line produced deletion + addition pair.');

  // Test 5: Empty text edge cases
  console.log('[Test 5] Testing empty string inputs...');
  const diffEmptyBoth = computeLineDiff('', '');
  assert.equal(diffEmptyBoth.length, 1);
  assert.equal(diffEmptyBoth[0].type, 'same');
  assert.equal(diffEmptyBoth[0].text, '');

  const diffOldEmpty = computeLineDiff('', 'Line 1\nLine 2');
  assert.equal(diffOldEmpty.filter(d => d.type === 'add').length, 2);

  const diffNewEmpty = computeLineDiff('Line 1\nLine 2', '');
  assert.equal(diffNewEmpty.filter(d => d.type === 'del').length, 2);
  console.log('  Passed: Empty string edge cases handled safely.');

  // Test 6: Performance benchmark with large document (5,000 lines)
  console.log('[Test 6] Testing performance on large 5,000 line document...');
  const linesOld: string[] = [];
  const linesNew: string[] = [];
  for (let i = 0; i < 5000; i++) {
    linesOld.push(`## Section ${i}: Standard paragraph line content with some text ${i * 7}`);
    if (i % 100 === 0) {
      linesNew.push(`## Section ${i}: MODIFIED paragraph line content with some text ${i * 7}`);
    } else if (i % 250 === 0) {
      // deleted
    } else {
      linesNew.push(`## Section ${i}: Standard paragraph line content with some text ${i * 7}`);
    }
  }

  const start = Date.now();
  const largeDiff = computeLineDiff(linesOld.join('\n'), linesNew.join('\n'));
  const elapsed = Date.now() - start;
  console.log(`  Performance: Diffed 5,000 lines in ${elapsed}ms (Result: ${largeDiff.length} diff items).`);
  assert(elapsed < 2000, `Diff took ${elapsed}ms, expected under 2000ms`);
  assert(largeDiff.length >= 5000, 'Diff should contain modified lines');
  console.log('  Passed: Large document diff executes with linear/O(ND) speed.');

  console.log('\n[PASS] All Myers computeLineDiff tests passed successfully!\n');
}

runTests().catch((err) => {
  console.error('[FAIL] Diff test failed:', err);
  process.exit(1);
});
