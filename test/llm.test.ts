import assert from "node:assert/strict";
import dotenv from "dotenv";
dotenv.config();

import { llmCall, extractJsonFromLlm, LLMAllProvidersFailedError } from "../src/core/llm";
import { runWriter } from "../src/core/writer";
import { runCritic } from "../src/core/critic";

async function runTests() {
  console.log("=== Ballast LLM Routing & Fallback Test Suite ===");

  // Test 1: Writer Call Execution
  console.log("\n[Test 1] Writer role invocation...");
  const writerText = await llmCall(
    "Return the single word: BALLAST",
    "You are a concise test assistant.",
    { role: "writer", maxTokens: 20 }
  );
  assert.ok(writerText.includes("BALLAST"), `Expected text to include BALLAST, got: ${writerText}`);
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
    process.env.NODE_ENV = "production";

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
    process.env.NODE_ENV = originalNodeEnv;
  }

  console.log("\n=== ALL LLM ROUTING & FALLBACK TESTS PASSED ===");
}

runTests().catch((err) => {
  console.error("\n❌ LLM Test Suite Failed:", err);
  process.exit(1);
});
