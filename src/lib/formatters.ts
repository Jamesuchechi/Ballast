/**
 * Ballast Text Formatting & Humanization Utilities
 * Cleans machine tokens, raw HTML, tracking URLs, and UUIDs for ordinary human readability.
 */

/**
 * Strips raw HTML tags, decodes HTML entities, and removes tracking noise / percent-encoded junk.
 */
export function cleanHtmlAndTracking(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // 1. Remove script and style tags and their contents
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // 2. Decode common HTML entities
  cleaned = cleaned
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#x3D;/gi, '=');

  // 3. Remove raw HTML tags (e.g. <a ...>, <span ...>, </td>, </tr>, <strong>)
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // 4. Remove residual HTML attribute noise if left over in text
  cleaned = cleaned.replace(/target="_blank"|class="[^"]*"|style="[^"]*"/gi, ' ');

  // 5. Clean up percent-encoded URLs and Reddit/digest tracking slugs (e.g. *com%2Fr%2F...*)
  cleaned = cleaned.replace(/(\*?)(com%2F[^\s"'>*]+)(\*?)/g, (_match, _p1, encodedUrl) => {
    try {
      const decoded = decodeURIComponent(encodedUrl);
      const segments = decoded.split('/').filter(Boolean);
      const last = segments[segments.length - 1] || '';
      if (last && !last.includes('?') && !last.includes('=')) {
        return last.replace(/_/g, ' ');
      }
      return '';
    } catch {
      return '';
    }
  });

  // 6. Simplify verbose tracking query strings in URLs
  cleaned = cleaned.replace(/\((https?:\/\/[^\s)]+)\)/g, (match, url) => {
    try {
      const parsedUrl = new URL(url);
      const cleanPath = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname.slice(0, 30);
      return `(${parsedUrl.hostname}${cleanPath})`;
    } catch {
      return match;
    }
  });

  // 7. Remove raw chunk UUID markers from the text body
  cleaned = cleaned.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');

  // 8. Clean up stray leading/trailing quotes or markdown artifacts like Block" - Claim:
  cleaned = cleaned.replace(/^[A-Za-z0-9_]+"\s*-\s*Claim:\s*/i, '');
  cleaned = cleaned.replace(/^\d+%\*?\s*-\s*Claim:\s*/i, '');

  // 9. Collapse multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Returns a human-friendly source name for users instead of raw GUIDs or database chunk keys.
 */
export function humanizeSourceLabel(sourceId?: string | null, sourceClass?: string | null): string {
  if (!sourceId && !sourceClass) return 'Private Workspace Source';
  if (!sourceId) return sourceClass === 'web' ? 'Web Source' : 'Your Files';

  // Check if sourceId is a UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId);
  if (isUuid) {
    return sourceClass === 'web' ? 'Web Search Result' : 'Your Files';
  }

  // If it's a URL
  if (sourceId.startsWith('http://') || sourceId.startsWith('https://')) {
    try {
      const u = new URL(sourceId);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return sourceClass === 'web' ? 'Web Source' : 'Source Link';
    }
  }

  // If it's a filename or connector path
  const filename = sourceId.split('/').pop() || sourceId;
  const cleanFilename = filename.replace(/^[0-9a-f-]{36}_/i, '');
  return cleanFilename.length > 35 ? cleanFilename.slice(0, 32) + '...' : cleanFilename;
}

/**
 * Parses and humanizes a raw citation line (e.g. `[private] <uuid> — “<quote>”`)
 */
export function parseAndHumanizeCitationLine(line: string): {
  sourceClass: string;
  sourceLabel: string;
  quote: string;
} {
  const trimmed = line.trim().replace(/^[-*]\s*/, '');
  
  // Format: [class] <source> — “<quote>” or [class] <source> - "<quote>"
  const match = trimmed.match(/^\[(private|web|unchecked)\]\s*([^\s—\-]+)?\s*[—\-]\s*[“"']?([\s\S]*?)[”"']?$/i);
  
  if (match) {
    const rawClass = match[1].toLowerCase();
    const rawSource = match[2];
    const rawQuote = match[3];

    return {
      sourceClass: rawClass,
      sourceLabel: humanizeSourceLabel(rawSource, rawClass),
      quote: cleanHtmlAndTracking(rawQuote),
    };
  }

  return {
    sourceClass: 'private',
    sourceLabel: 'Your Files',
    quote: cleanHtmlAndTracking(trimmed),
  };
}
