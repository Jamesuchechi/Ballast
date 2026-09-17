/**
 * Template Validator and Resolver for Scheduled Brief Prompts (M5 Resolution)
 * Supports dynamic timezone-aware tags:
 * {{date}}, {{today}}, {{yesterday}}, {{time}}, {{datetime}}, {{timestamp}}, {{day_of_week}}, {{weekday}}, {{month}}, {{year}}, {{timezone}}
 */

export const SUPPORTED_TEMPLATE_TAGS = [
  'date',
  'today',
  'yesterday',
  'time',
  'datetime',
  'timestamp',
  'day_of_week',
  'weekday',
  'month',
  'year',
  'timezone',
] as const;

export type SupportedTemplateTag = (typeof SUPPORTED_TEMPLATE_TAGS)[number];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  tags: string[];
  unrecognizedTags: string[];
}

export interface TimezoneFormattedDate {
  date: string; // YYYY-MM-DD
  yesterday: string; // YYYY-MM-DD
  time: string; // HH:MM
  datetime: string; // YYYY-MM-DD HH:MM
  weekday: string; // Monday
  month: string; // September
  year: string; // 2026
}

/**
 * Formats a Date object in a specific IANA timezone safely using Intl.DateTimeFormat.
 */
export function formatInTimezone(
  date: Date = new Date(),
  timezone: string = 'UTC'
): TimezoneFormattedDate {
  let tz = timezone || 'UTC';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    tz = 'UTC';
  }

  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = dtf.format(date);

  const yesterdayDate = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = dtf.format(yesterdayDate);

  const timeDtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const timeStr = timeDtf.format(date);

  const weekdayDtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
  });
  const weekdayStr = weekdayDtf.format(date);

  const monthDtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'long',
  });
  const monthStr = monthDtf.format(date);

  const yearDtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
  });
  const yearStr = yearDtf.format(date);

  return {
    date: dateStr,
    yesterday: yesterdayStr,
    time: timeStr,
    datetime: `${dateStr} ${timeStr}`,
    weekday: weekdayStr,
    month: monthStr,
    year: yearStr,
  };
}

export interface RenderQuestionTemplateOptions {
  date?: Date;
  timezone?: string;
}

/**
 * Validates a question template for syntax errors and unrecognized {{...}} tags.
 */
export function validateQuestionTemplate(template: string): ValidationResult {
  if (!template || typeof template !== 'string' || !template.trim()) {
    return {
      valid: false,
      errors: ['Question template cannot be empty'],
      tags: [],
      unrecognizedTags: [],
    };
  }

  const errors: string[] = [];
  const recognizedTags: string[] = [];
  const unrecognizedTags: string[] = [];

  // Check for unclosed {{ or orphaned }}
  const unclosedMatch = template.match(/\{\{[^}]*$/);
  if (unclosedMatch) {
    errors.push(`Unclosed template tag syntax: found '{{' without closing '}}'`);
  }

  // Find all {{...}} patterns
  const tagRegex = /\{\{\s*([^{}]*?)\s*\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(template)) !== null) {
    const rawTag = match[1].trim();
    const normalizedTag = rawTag.toLowerCase();

    if (!normalizedTag) {
      errors.push('Empty template tag {{}} detected');
      continue;
    }

    if (SUPPORTED_TEMPLATE_TAGS.includes(normalizedTag as SupportedTemplateTag)) {
      if (!recognizedTags.includes(normalizedTag)) {
        recognizedTags.push(normalizedTag);
      }
    } else {
      if (!unrecognizedTags.includes(rawTag)) {
        unrecognizedTags.push(rawTag);
      }
      errors.push(
        `Unrecognized template tag '{{${rawTag}}}'. Supported tags: ${SUPPORTED_TEMPLATE_TAGS.map((t) => `{{${t}}}`).join(', ')}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    tags: recognizedTags,
    unrecognizedTags,
  };
}

/**
 * Resolves question template into dynamic prompt text with comprehensive timezone & date tags.
 */
export function renderQuestionTemplate(
  template: string,
  options?: RenderQuestionTemplateOptions
): string {
  if (!template) return '';
  const date = options?.date || new Date();
  const tz = options?.timezone || 'UTC';
  const formatted = formatInTimezone(date, tz);

  return template
    .replace(/\{\{\s*(?:date|today)\s*\}\}/gi, formatted.date)
    .replace(/\{\{\s*yesterday\s*\}\}/gi, formatted.yesterday)
    .replace(/\{\{\s*time\s*\}\}/gi, formatted.time)
    .replace(/\{\{\s*(?:datetime|timestamp)\s*\}\}/gi, formatted.datetime)
    .replace(/\{\{\s*(?:day_of_week|weekday)\s*\}\}/gi, formatted.weekday)
    .replace(/\{\{\s*month\s*\}\}/gi, formatted.month)
    .replace(/\{\{\s*year\s*\}\}/gi, formatted.year)
    .replace(/\{\{\s*timezone\s*\}\}/gi, tz);
}

/**
 * Previews a question template with validation and rendered sample output.
 */
export function previewQuestionTemplate(
  template: string,
  options?: RenderQuestionTemplateOptions
): {
  rendered: string;
  validation: ValidationResult;
} {
  const validation = validateQuestionTemplate(template);
  const rendered = renderQuestionTemplate(template, options);
  return {
    rendered,
    validation,
  };
}
