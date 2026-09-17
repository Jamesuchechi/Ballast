import net from 'node:net';

export interface MalwareScanResult {
  clean: boolean;
  threatName?: string;
  threatType?: 'eicar' | 'executable_header' | 'malicious_pdf_script' | 'embedded_script' | 'clamav';
  details?: string;
}

// EICAR Standard Antivirus Test String signature (case-insensitive search)
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

// Magic bytes for executable binary payloads
const MAGIC_BYTES = {
  ELF: [0x7f, 0x45, 0x4c, 0x46], // Linux ELF binary
  MACHO_32: [0xfe, 0xed, 0xfa, 0xce],
  MACHO_64: [0xfe, 0xed, 0xfa, 0xcf],
  MACHO_32_REV: [0xce, 0xfa, 0xed, 0xfe],
  MACHO_64_REV: [0xcf, 0xfa, 0xed, 0xfe],
  JAVA_CLASS: [0xca, 0xfe, 0xba, 0xbe],
};

function matchesBytes(buffer: Buffer, pattern: number[]): boolean {
  if (buffer.length < pattern.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (buffer[i] !== pattern[i]) return false;
  }
  return true;
}

/**
 * Scans a file buffer using local multi-layer heuristic malware signatures,
 * embedded executable detectors, malicious PDF script analyzers, and optional ClamAV daemon.
 */
export async function scanBufferForMalware(
  buffer: Buffer,
  filename: string
): Promise<MalwareScanResult> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  // 1. EICAR Standard Test Signature Detection
  const contentStr = buffer.toString('latin1');
  if (contentStr.includes(EICAR_SIGNATURE) || buffer.toString('utf8', 0, Math.min(buffer.length, 1024)).includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
    return {
      clean: false,
      threatName: 'EICAR-Test-Signature',
      threatType: 'eicar',
      details: 'Standard antivirus test virus signature detected.',
    };
  }

  // 2. Binary Executable Header Detection (Disguised PE / ELF / Mach-O files)
  // Check Windows MZ / PE header
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) { // 'MZ'
    // Exclude false positives for short text, but check PE header offset
    if (buffer.length >= 64) {
      const peOffset = buffer.readUInt32LE(60);
      if (peOffset > 0 && peOffset < buffer.length - 4) {
        if (
          buffer[peOffset] === 0x50 && // 'P'
          buffer[peOffset + 1] === 0x45 && // 'E'
          buffer[peOffset + 2] === 0x00 &&
          buffer[peOffset + 3] === 0x00
        ) {
          return {
            clean: false,
            threatName: 'Win32.Executable.PE',
            threatType: 'executable_header',
            details: 'Windows PE executable header disguised in document upload.',
          };
        }
      }
    }
  }

  // Check Linux ELF executable
  if (matchesBytes(buffer, MAGIC_BYTES.ELF)) {
    return {
      clean: false,
      threatName: 'Linux.ELF.Binary',
      threatType: 'executable_header',
      details: 'Linux ELF executable binary disguised in document upload.',
    };
  }

  // Check Mach-O executable
  if (
    matchesBytes(buffer, MAGIC_BYTES.MACHO_32) ||
    matchesBytes(buffer, MAGIC_BYTES.MACHO_64) ||
    matchesBytes(buffer, MAGIC_BYTES.MACHO_32_REV) ||
    matchesBytes(buffer, MAGIC_BYTES.MACHO_64_REV)
  ) {
    return {
      clean: false,
      threatName: 'MacOS.MachO.Binary',
      threatType: 'executable_header',
      details: 'macOS Mach-O executable binary disguised in document upload.',
    };
  }

  // 3. Dangerous PDF Exploit Vectors & Embedded JavaScript
  if (ext === 'pdf') {
    const rawPdf = buffer.toString('latin1');
    const dangerousPdfTokens = [
      { token: /\/JavaScript\b/i, name: 'PDF.EmbeddedJavaScript' },
      { token: /\/JS\s*\(/i, name: 'PDF.InlineScript' },
      { token: /\/Launch\b/i, name: 'PDF.LaunchExecutableAction' },
      { token: /\/EmbeddedFiles\b/i, name: 'PDF.EmbeddedExecutableFiles' },
    ];

    for (const item of dangerousPdfTokens) {
      if (item.token.test(rawPdf)) {
        return {
          clean: false,
          threatName: item.name,
          threatType: 'malicious_pdf_script',
          details: `Active script or launch vector detected in PDF: ${item.name}`,
        };
      }
    }
  }

  // 4. Disguised Script Payloads in Non-Script Formats (e.g. shell / powershell in images or csv)
  if (['png', 'jpg', 'jpeg'].includes(ext)) {
    // Check if an image is actually an unescaped shell / bash script
    const prefix = buffer.toString('utf8', 0, Math.min(buffer.length, 128)).trim();
    if (prefix.startsWith('#!/bin/sh') || prefix.startsWith('#!/bin/bash') || prefix.startsWith('@echo off') || prefix.startsWith('<?php')) {
      return {
        clean: false,
        threatName: 'Script.DisguisedAsImage',
        threatType: 'embedded_script',
        details: 'Executable shell/script payload disguised as an image extension.',
      };
    }
  }

  // 5. Optional External ClamAV Daemon Scanning
  if (process.env.CLAMAV_HOST && process.env.CLAMAV_PORT) {
    try {
      const clamResult = await scanWithClamAV(
        buffer,
        process.env.CLAMAV_HOST,
        parseInt(process.env.CLAMAV_PORT, 10)
      );
      if (!clamResult.clean) {
        return clamResult;
      }
    } catch (clamErr) {
      console.warn('[Scanner] ClamAV daemon scan error, fallback to built-in heuristics:', clamErr);
    }
  }

  return { clean: true };
}

/**
 * Optional network socket scanner for ClamAV daemon (zINSTREAM protocol).
 */
function scanWithClamAV(
  buffer: Buffer,
  host: string,
  port: number
): Promise<MalwareScanResult> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';

    socket.setTimeout(4000);

    socket.connect(port, host, () => {
      socket.write('zINSTREAM\0');

      const chunkSize = 2048;
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const chunk = buffer.subarray(offset, offset + chunkSize);
        const lengthHeader = Buffer.alloc(4);
        lengthHeader.writeUInt32BE(chunk.length, 0);
        socket.write(lengthHeader);
        socket.write(chunk);
      }

      // Zero-length chunk signals EOF
      const eofHeader = Buffer.alloc(4);
      eofHeader.writeUInt32BE(0, 0);
      socket.write(eofHeader);
    });

    socket.on('data', (data) => {
      response += data.toString('utf8');
    });

    socket.on('end', () => {
      socket.destroy();
      if (response.includes('FOUND')) {
        const match = response.match(/stream: (.+) FOUND/);
        const threat = match ? match[1] : 'ClamAV.ThreatFound';
        resolve({
          clean: false,
          threatName: threat,
          threatType: 'clamav',
          details: `ClamAV detected: ${threat}`,
        });
      } else {
        resolve({ clean: true });
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ clean: true });
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
  });
}
