import { objectStore } from '@/storage/objectStore';

/**
 * Deterministic pure PDF-1.4 generator.
 * Produces valid multi-page PDF documents from brief Markdown / HTML without external binary dependencies.
 */
export function generateSimplePdf(title: string, lines: string[]): Buffer {
  // Page setup: A4 595 x 842 pt, 50 pt margins
  const marginX = 50;
  const bottomMargin = 55;
  const startY = 780;
  const lineLeading = 15;
  const headingLeading = 24;

  const pageStreams: string[] = [];
  let currentStream = '';
  let cursorY = startY;
  let pageNum = 1;

  function startNewPage() {
    if (currentStream.length > 0) {
      pageStreams.push(currentStream);
    }
    pageNum++;
    cursorY = startY;
    // Running header on subsequent pages
    currentStream = `BT\n/F2 8 Tf\n${marginX} 810 Td\n(${escapePdf(title)} - Page ${pageNum}) Tj\nET\n`;
  }

  // First page header
  currentStream = `BT\n/F1 18 Tf\n${marginX} ${cursorY} Td\n(${escapePdf(title)}) Tj\nET\n`;
  cursorY -= headingLeading;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      cursorY -= 8;
      if (cursorY < bottomMargin) {
        startNewPage();
      }
      continue;
    }

    if (line.startsWith('# ')) {
      // Top-level document title already placed
      continue;
    } else if (line.startsWith('## ')) {
      if (cursorY < bottomMargin + 40) {
        startNewPage();
      }
      cursorY -= 8;
      const heading = line.replace('## ', '');
      currentStream += `BT\n/F2 13 Tf\n${marginX} ${cursorY} Td\n(${escapePdf(heading)}) Tj\nET\n`;
      cursorY -= headingLeading;
    } else if (line.startsWith('### ')) {
      if (cursorY < bottomMargin + 25) {
        startNewPage();
      }
      const subHeading = line.replace('### ', '');
      currentStream += `BT\n/F2 11 Tf\n${marginX + 10} ${cursorY} Td\n(${escapePdf(subHeading)}) Tj\nET\n`;
      cursorY -= lineLeading;
    } else {
      if (cursorY < bottomMargin + 15) {
        startNewPage();
      }
      // Standard body or bullet line
      const indent = line.startsWith('- ') ? marginX + 15 : marginX;
      const displayLine = line.length > 95 ? line.slice(0, 92) + '...' : line;
      currentStream += `BT\n/F1 10 Tf\n${indent} ${cursorY} Td\n(${escapePdf(displayLine)}) Tj\nET\n`;
      cursorY -= lineLeading;
    }
  }

  if (currentStream.length > 0) {
    pageStreams.push(currentStream);
  }

  const pageCount = pageStreams.length;

  // Object Layout:
  // 1: Catalog
  // 2: Pages
  // 3: Font F1 (Helvetica)
  // 4: Font F2 (Helvetica-Bold)
  // For page i (0 to pageCount - 1):
  // Page object: 5 + 2*i
  // Stream object: 6 + 2*i
  let offset = 0;
  const offsets: number[] = [];

  const header = '%PDF-1.4\n';
  offset += Buffer.byteLength(header);

  // Object 1: Catalog
  offsets.push(offset);
  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  offset += Buffer.byteLength(obj1);

  // Object 2: Pages
  const pageObjectIds: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    pageObjectIds.push(`${5 + 2 * i} 0 R`);
  }
  offsets.push(offset);
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.join(' ')}] /Count ${pageCount} >>\nendobj\n`;
  offset += Buffer.byteLength(obj2);

  // Object 3: Font F1 (Helvetica)
  offsets.push(offset);
  const obj3 = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  offset += Buffer.byteLength(obj3);

  // Object 4: Font F2 (Helvetica-Bold)
  offsets.push(offset);
  const obj4 = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`;
  offset += Buffer.byteLength(obj4);

  // Pages and Content Streams
  let pagesBody = '';
  for (let i = 0; i < pageCount; i++) {
    const pageId = 5 + 2 * i;
    const streamId = 6 + 2 * i;
    const streamContent = pageStreams[i];
    const streamLength = Buffer.byteLength(streamContent);

    // Page object
    offsets.push(offset);
    const pageObj = `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${streamId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj\n`;
    pagesBody += pageObj;
    offset += Buffer.byteLength(pageObj);

    // Stream object
    offsets.push(offset);
    const streamObj = `${streamId} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
    pagesBody += streamObj;
    offset += Buffer.byteLength(streamObj);
  }

  // XREF Table
  const totalObjects = 4 + 2 * pageCount;
  const xrefOffset = offset;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const fullPdfString = `${header}${obj1}${obj2}${obj3}${obj4}${pagesBody}${xref}${trailer}`;
  return Buffer.from(fullPdfString, 'binary');
}

function escapePdf(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' '); // Replace non-ascii with space for basic Type1 Helvetica
}

export async function renderAndStorePdf(briefId: string, title: string, markdown: string): Promise<string> {
  const lines = markdown.split('\n');
  const pdfBuffer = generateSimplePdf(title, lines);
  const key = `pdfs/${briefId}.pdf`;
  const uri = await objectStore.put(key, pdfBuffer);
  return uri;
}
