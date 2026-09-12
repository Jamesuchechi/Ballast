import { objectStore } from '@/storage/objectStore';

/**
 * Deterministic pure PDF-1.4 generator.
 * Produces valid PDF documents from brief Markdown / HTML without external binary dependencies.
 */
export function generateSimplePdf(title: string, lines: string[]): Buffer {
  const contentStreams: string[] = [];
  
  // Page setup: A4 595 x 842 pt, 50 pt margins
  const marginX = 50;
  let cursorY = 790;
  const lineLeading = 15;
  const headingLeading = 24;

  let stream = `BT\n/F1 18 Tf\n${marginX} ${cursorY} Td\n(${escapePdf(title)}) Tj\nET\n`;
  cursorY -= headingLeading;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      cursorY -= 8;
      continue;
    }

    if (cursorY < 60) {
      // New page boundary could be handled, or paginate
      break;
    }

    if (line.startsWith('# ')) {
      // Main title already placed
      continue;
    } else if (line.startsWith('## ')) {
      cursorY -= 8;
      const heading = line.replace('## ', '');
      stream += `BT\n/F2 13 Tf\n${marginX} ${cursorY} Td\n(${escapePdf(heading)}) Tj\nET\n`;
      cursorY -= headingLeading;
    } else if (line.startsWith('### ')) {
      const subHeading = line.replace('### ', '');
      stream += `BT\n/F2 11 Tf\n${marginX + 10} ${cursorY} Td\n(${escapePdf(subHeading)}) Tj\nET\n`;
      cursorY -= lineLeading;
    } else {
      // Standard body or list
      const indent = line.startsWith('- ') ? marginX + 15 : marginX;
      // Truncate line if excessively long for single line or split
      const displayLine = line.length > 90 ? line.slice(0, 87) + '...' : line;
      stream += `BT\n/F1 10 Tf\n${indent} ${cursorY} Td\n(${escapePdf(displayLine)}) Tj\nET\n`;
      cursorY -= lineLeading;
    }
  }

  contentStreams.push(stream);

  const streamContent = contentStreams.join('\n');
  const streamLength = Buffer.byteLength(streamContent);

  // Assemble PDF Objects
  let offset = 0;
  const offsets: number[] = [];

  const header = '%PDF-1.4\n';
  offset += Buffer.byteLength(header);

  // Object 1: Catalog
  offsets.push(offset);
  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  offset += Buffer.byteLength(obj1);

  // Object 2: Pages
  offsets.push(offset);
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  offset += Buffer.byteLength(obj2);

  // Object 3: Page
  offsets.push(offset);
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`;
  offset += Buffer.byteLength(obj3);

  // Object 4: Content Stream
  offsets.push(offset);
  const obj4 = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
  offset += Buffer.byteLength(obj4);

  // Object 5: Standard Font Helvetica
  offsets.push(offset);
  const obj5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  offset += Buffer.byteLength(obj5);

  // Object 6: Standard Font Helvetica-Bold
  offsets.push(offset);
  const obj6 = `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`;
  offset += Buffer.byteLength(obj6);

  // XREF
  const xrefOffset = offset;
  let xref = `xref\n0 7\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const fullPdfString = `${header}${obj1}${obj2}${obj3}${obj4}${obj5}${obj6}${xref}${trailer}`;
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
