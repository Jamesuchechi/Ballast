import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

import { estimateLLMCost, MODEL_PRICING } from '../src/core/llm';

async function runCostTests() {
  console.log('=== Ballast Real Cost Estimation Test Suite (Bug 8) ===\n');

  // Test 1: OpenRouter free tier models should incur $0.000000 cost
  console.log('[Test 1] Testing OpenRouter :free models return zero cost...');
  const openRouterFreeCost = estimateLLMCost('openrouter', 'nvidia/nemotron-3.5-lightning:free', 2000, 800);
  assert.strictEqual(openRouterFreeCost, 0, 'OpenRouter :free models must be 0 cost');

  const nexMiniCost = estimateLLMCost('openrouter', 'nex-agi/nex-n2.5-mini:free', 5000, 1000);
  assert.strictEqual(nexMiniCost, 0, 'nex-n2.5-mini:free must be 0 cost');

  // Test 2: Groq model cost calculation (actual rate: $0.05/M in, $0.08/M out)
  console.log('[Test 2] Testing Groq llama-3.1-8b-instant cost calculation...');
  // 1500 * 0.05 / 1M = 0.000075
  // 500 * 0.08 / 1M = 0.000040
  // total = 0.000115
  const groqCost = estimateLLMCost('groq', 'llama-3.1-8b-instant', 1500, 500);
  assert.strictEqual(groqCost, 0.000115, 'Groq cost should match actual token rate ($0.000115, not hardcoded $0.0025)');

  // Test 3: Gemini Flash cost calculation
  console.log('[Test 3] Testing Gemini 3.6 Flash cost estimation...');
  // 1,000,000 prompt tokens = $0.075, 1,000,000 completion tokens = $0.30
  // For 10,000 in, 1,000 out:
  // in = 10,000 * 0.075 / 1,000,000 = 0.00075
  // out = 1,000 * 0.30 / 1,000,000 = 0.00030
  // total = 0.00105
  const geminiFlashCost = estimateLLMCost('gemini', 'gemini-3.6-flash', 10000, 1000);
  assert.strictEqual(geminiFlashCost, 0.00105, 'Gemini 3.6 Flash cost should match token pricing formula');

  // Test 4: Gemini Pro cost calculation
  console.log('[Test 4] Testing Gemini 3.1 Pro cost estimation...');
  // 1,000 prompt tokens ($1.25/M) = 0.00125
  // 500 completion tokens ($5.00/M) = 0.00250
  // total = 0.00375
  const geminiProCost = estimateLLMCost('gemini', 'gemini-3.1-pro', 1000, 500);
  assert.strictEqual(geminiProCost, 0.00375, 'Gemini 3.1 Pro cost should match token pricing formula');

  // Test 5: Mistral cost calculation
  console.log('[Test 5] Testing Mistral Ministral 8B cost estimation...');
  // 10,000 in ($0.10/M) = 0.00100
  // 2,000 out ($0.10/M) = 0.00020
  // total = 0.00120
  const mistralCost = estimateLLMCost('mistral', 'ministral-8b-latest', 10000, 2000);
  assert.strictEqual(mistralCost, 0.0012, 'Ministral 8B cost should match token pricing formula');

  // Test 6: Verify MODEL_PRICING covers all configured models
  console.log('[Test 6] Verifying MODEL_PRICING coverage...');
  assert.ok(MODEL_PRICING['gemini-3.6-flash'] !== undefined);
  assert.ok(MODEL_PRICING['gemini-3.5-flash'] !== undefined);
  assert.ok(MODEL_PRICING['gemini-flash-latest'] !== undefined);
  assert.ok(MODEL_PRICING['llama-3.3-70b-versatile'] !== undefined);
  assert.ok(MODEL_PRICING['llama-3.1-8b-instant'] !== undefined);
  assert.ok(MODEL_PRICING['ministral-8b-latest'] !== undefined);
  assert.ok(MODEL_PRICING['ministral-3b-latest'] !== undefined);

  console.log('\n[PASS] All cost calculation tests passed successfully!');
}

runCostTests().catch((err) => {
  console.error('[FAIL] Cost calculation test failed:', err);
  process.exit(1);
});
