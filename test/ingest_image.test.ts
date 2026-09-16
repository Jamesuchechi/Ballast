import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

import { extractTextFromBuffer, validateUpload } from '../src/core/ingest';

// 1x1 transparent PNG buffer
const dummyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function runImageTests() {
  console.log('=== Ballast Multimodal Image Ingestion Test Suite ===\n');

  // 1. Validation check
  const { ext } = validateUpload('architecture_diagram.png', dummyPng.length);
  assert.equal(ext, '.png');
  console.log('✓ Image upload validation passed for .png');

  // 2. Multimodal extraction
  console.log('Testing multimodal extraction with Gemini Vision...');
  const text = await extractTextFromBuffer(dummyPng, '.png', 'architecture_diagram.png', 'image/png');
  console.log('Extracted image content preview:\n', text);
  assert.ok(text.length > 0, 'Extracted image text must not be empty');
  assert.ok(!text.includes('Image source metadata embedded for reference'), 'Must not return old static placeholder');
  console.log('✓ Multimodal image extraction returned valid textual representation');

  // 3. Fail-closed check when GEMINI_API_KEY is missing (and mock disabled)
  const origKey = process.env.GEMINI_API_KEY;
  const origMock = process.env.EVAL_USE_MOCK;
  const origEnv = process.env.NODE_ENV;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.EVAL_USE_MOCK;
    process.env.NODE_ENV = 'production';

    await assert.rejects(
      async () => {
        await extractTextFromBuffer(dummyPng, '.png', 'test.png');
      },
      {
        message: /Image ingestion for 'test.png' requires GEMINI_API_KEY/,
      }
    );
    console.log('✓ Missing GEMINI_API_KEY fail-closed error verified');
  } finally {
    process.env.GEMINI_API_KEY = origKey;
    process.env.EVAL_USE_MOCK = origMock;
    process.env.NODE_ENV = origEnv;
  }

  console.log('\n=== ALL IMAGE INGESTION TESTS PASSED ===');
}

runImageTests().catch((err) => {
  console.error('❌ Image Ingestion Tests Failed:', err);
  process.exit(1);
});
