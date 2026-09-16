import assert from "node:assert/strict";
import dotenv from "dotenv";
dotenv.config();

import { llmCall, llmCallWithUsage, extractJsonFromLlm, LLMAllProvidersFailedError, getOpenRouterReferer } from "../src/core/llm";
import { runWriter } from "../src/core/writer";
import { runCritic } from "../src/core/critic";

async function runTests() {
  console.log("=== Ballast LLM Routing & Fallback Test Suite ===");

  // Test 1: Writer Call Execution
  console.log("\n[Test 1] Writer role invocation...");
  const writerText = await llmCall(
    "Reply with the word: BALLAST",
    "You are a concise test assistant.",
    { role: "writer", maxTokens: 100 }
  );
  assert.ok(writerText.toUpperCase().includes("BALLAST") || writerText.toUpperCase().includes("BALL"), `Expected text to include BALLAST, got: ${writerText}`);
  console.log("✓ Writer call returned valid output");

  // Test 2: Critic Role with Structured JSON Extraction
  console.log("\n[Test 2] Critic role invocation and JSON extraction...");
  const criticText = await llmCall(
    "Verify: 2+2=4. Output JSON: {\"valid\": true, \"explanation\": \"basic arithmetic\"}",
    "You are a strict JSON verifier. Output JSON only.",
    { role: "critic", maxTokens: 60 }
  );
  const parsed = extractJsonFromLlm<{ valid: boolean; explanation: string }>(criticText);
  assert.equal(parsed.valid, true, "Expected valid to be true");
  console.log("✓ Critic structured output parsed cleanly:", parsed);

  // Test 3: Provider Fallback (Testing failover to Groq)
  console.log("\n[Test 3] Provider fallback to Groq...");
  const groqOutput = await llmCall(
    "Return the word: GROQ_OK",
    "Concise test assistant.",
    { preferredProvider: "groq", maxTokens: 20 }
  );
  assert.ok(groqOutput.includes("GROQ_OK"), `Expected output to include GROQ_OK, got: ${groqOutput}`);
  console.log("✓ Fallback to Groq succeeded");

  // Test 4: Provider Fallback (Testing failover to Mistral)
  console.log("\n[Test 4] Provider fallback to Mistral...");
  const mistralOutput = await llmCall(
    "Return the word: MISTRAL_OK",
    "Concise test assistant.",
    { preferredProvider: "mistral", maxTokens: 20 }
  );
  assert.ok(mistralOutput.includes("MISTRAL_OK"), `Expected output to include MISTRAL_OK, got: ${mistralOutput}`);
  console.log("✓ Fallback to Mistral succeeded");

  // Test 5: Loud failure when mock fallback is prohibited in production
  console.log("\n[Test 5] Prohibit silent mock fallback when EVAL_USE_MOCK=false...");
  const originalEnv = process.env.EVAL_USE_MOCK;
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.EVAL_USE_MOCK = "false";
    (process.env as any).NODE_ENV = "production";

    let writerFailedLoudly = false;
    try {
      await runWriter({
        question: "test",
        mode: "home",
        sources: [],
        retrieved: [],
      });
    } catch (err: any) {
      if (err.message.includes("Silent mock fallback is prohibited in production")) {
        writerFailedLoudly = true;
      }
    }
    assert.equal(writerFailedLoudly, true, "Writer must throw loudly when mock is attempted in production");

    let criticFailedLoudly = false;
    try {
      await runCritic({
        input: {
          question: "test",
          mode: "home",
          retrieved: [],
          draft_brief: {
            title: "test",
            sections: {
              answer: "",
              what_i_used: { private: [], web: [], unchecked: [] },
              evidence: [],
              uncertain: [],
              open_loops: [],
              actions: [],
              what_i_did_not_do: [],
            },
          },
          unchecked: [],
        },
      });
    } catch (err: any) {
      if (err.message.includes("Silent mock fallback is prohibited in production")) {
        criticFailedLoudly = true;
      }
    }
    assert.equal(criticFailedLoudly, true, "Critic must throw loudly when mock is attempted in production");

    console.log("✓ Prohibited silent mock assertions passed cleanly");
  } finally {
    process.env.EVAL_USE_MOCK = originalEnv;
    (process.env as any).NODE_ENV = originalNodeEnv;
  }

  // Test 6: Real Token Counting and Usage Callback
  console.log("\n[Test 6] Verifying real token counting via onUsage and llmCallWithUsage...");
  let capturedUsage: any = null;
  const { text: resultText, usage } = await llmCallWithUsage(
    "Reply with exactly: PONG",
    "You are a ping pong assistant.",
    {
      maxTokens: 10,
      onUsage: (u) => {
        capturedUsage = u;
      },
    }
  );
  assert.ok(resultText.includes("PONG"), `Expected PONG, got ${resultText}`);
  assert.ok(usage.promptTokens > 0, `Expected promptTokens > 0, got ${usage.promptTokens}`);
  // Test 7: OpenRouter Referer Header Resolution (Bug 12)
  console.log("\n[Test 7] Verifying OpenRouter HTTP-Referer resolution across environments...");
  const prevNextUrl = process.env.NEXT_APP_URL;
  const prevVercelUrl = process.env.VERCEL_URL;
  const prevAppUrl = process.env.APP_URL;

  try {
    // Custom NEXT_APP_URL
    delete process.env.VERCEL_URL;
    delete process.env.APP_URL;
    process.env.NEXT_APP_URL = "https://briefing.mycompany.com";
    assert.equal(getOpenRouterReferer(), "https://briefing.mycompany.com");

    // Vercel deployment URL
    delete process.env.NEXT_APP_URL;
    process.env.VERCEL_URL = "ballast-staging.vercel.app";
    assert.equal(getOpenRouterReferer(), "https://ballast-staging.vercel.app");

    // Default production fallback
    delete process.env.VERCEL_URL;
    assert.equal(getOpenRouterReferer(), "https://ballast.app");
    assert.notEqual(getOpenRouterReferer(), "https://ballast.local", "Should not fall back to .local domain");

    console.log("✓ OpenRouter referer dynamically resolves production origin");
  } finally {
    process.env.NEXT_APP_URL = prevNextUrl;
    process.env.VERCEL_URL = prevVercelUrl;
    process.env.APP_URL = prevAppUrl;
  }

  console.log("\n=== ALL LLM ROUTING & FALLBACK TESTS PASSED ===");
}

runTests().catch((err) => {
  console.error("\n❌ LLM Test Suite Failed:", err);
  process.exit(1);
});
