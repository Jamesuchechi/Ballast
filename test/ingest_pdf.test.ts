import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { extractTextFromBuffer, validateUpload } from '../src/core/ingest';

async function runPdfTests() {
  console.log('=== Ballast PDF Ingest & Text Extraction Test Suite ===\n');

  const tmpPdfPath = path.join(process.cwd(), 'temp_test_doc.pdf');

  try {
    // 1. Generate real valid PDF with text
    execSync(
      `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dNOPAUSE -dQUIET -dBATCH -sOutputFile=${tmpPdfPath} -c "newpath 100 200 moveto /Helvetica 12 selectfont (Ballast Grounded Intelligence Briefing Test) show showpage"`
    );

    const pdfBuffer = fs.readFileSync(tmpPdfPath);
    assert.ok(pdfBuffer.length > 0, 'PDF buffer should not be empty');

    // 2. Test validateUpload on PDF
    const { ext } = validateUpload('test_brief.pdf', pdfBuffer.length);
    assert.equal(ext, '.pdf');
    console.log('✓ PDF upload validation accepted');

    // 3. Test extractTextFromBuffer on real PDF
    const extractedText = await extractTextFromBuffer(pdfBuffer, '.pdf', 'test_brief.pdf');
    console.log('Extracted text preview:', JSON.stringify(extractedText));
    assert.ok(
      extractedText.includes('Ballast Grounded Intelligence Briefing Test'),
      'Extracted text must contain the actual PDF content'
    );
    assert.ok(
      !extractedText.includes('Text content extracted from PDF payload'),
      'Must NOT return the old fallback stub string'
    );
    console.log('✓ Real PDF text extraction verified');

    // 4. Test empty/corrupt PDF rejection
    const dummyBuffer = Buffer.from('%PDF-1.4 empty document %%EOF');
    await assert.rejects(
      async () => {
        await extractTextFromBuffer(dummyBuffer, '.pdf', 'corrupt.pdf');
      },
      {
        message: /Failed to extract text from PDF/,
      }
    );
    console.log('✓ Empty/unextractable PDF rejection verified');

  } finally {
    if (fs.existsSync(tmpPdfPath)) {
      fs.unlinkSync(tmpPdfPath);
    }
  }

  console.log('\n=== ALL PDF INGEST TESTS PASSED ===');
}

runPdfTests().catch((err) => {
  console.error('❌ PDF Ingest Tests Failed:', err);
  process.exit(1);
});
