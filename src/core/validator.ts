import Ajv from "ajv";
import addFormats from "ajv-formats";
import criticOutSchema from "../../eval/schema/critic.out.json" with { type: "json" };
import type {
  BriefMode,
  CitationRecord,
  CriticOutput,
  PublishedEvidenceItem,
  PublishedBriefSections,
  UncheckedConnector,
} from "./types.js";

const AjvClass = (Ajv as any).default || Ajv;
const addFormatsFn = (addFormats as any).default || addFormats;
const ajv = new AjvClass({ allErrors: true });
addFormatsFn(ajv);
const validateCriticOutputSchema = ajv.compile(criticOutSchema);

export interface PublishValidatorInput {
  markdown: string;
  mode: BriefMode;
  criticOutput: unknown;
  evidence: PublishedEvidenceItem[];
  unchecked: UncheckedConnector[];
  sections: PublishedBriefSections;
}

export interface PublishValidationResult {
  valid: boolean;
  status: "published" | "failed";
  errors: string[];
}

export const MANDATORY_HEADINGS = [
  "## Answer",
  "## What I used",
  "### Private",
  "### Web",
  "### Could not be checked",
  "## Evidence",
  "## Uncertain / missing",
  "## Open loops",
  "## Actions",
  "## What I did not do",
];

/**
 * Pure publish validator enforcing normative gates before status=published.
 * Does not call any network or models.
 */
export function validateForPublish(
  input: PublishValidatorInput
): PublishValidationResult {
  const errors: string[] = [];

  // Gate 5: Critic output parsed against critic.out schema (FR4.10)
  const isCriticSchemaValid = validateCriticOutputSchema(input.criticOutput);
  if (!isCriticSchemaValid) {
    const ajvErrors = (validateCriticOutputSchema.errors || [])
      .map((e: any) => `${e.instancePath} ${e.message}`)
      .join(", ");
    return {
      valid: false,
      status: "failed",
      errors: [`Critic schema validation failed: ${ajvErrors}`],
    };
  }

  const typedCritic = input.criticOutput as CriticOutput;

  // Gate 1: Check all mandatory headings in template v1
  for (const heading of MANDATORY_HEADINGS) {
    if (!input.markdown.includes(heading)) {
      errors.push(`Missing mandatory heading: "${heading}"`);
    }
  }

  // Gate 6: FR4.9 empty-evidence path vs normal path
  const hasKeepClaims = typedCritic.keep && typedCritic.keep.length > 0;
  if (!hasKeepClaims) {
    // If keep is empty, the brief must not present grounded claims.
    // Uncertain / missing and What I did not do must be populated.
    if (input.evidence.length > 0) {
      errors.push("Evidence contains claims but critic keep list is empty.");
    }
    if (input.sections.uncertain.length === 0) {
      errors.push("Empty-evidence brief must populate 'Uncertain / missing'.");
    }
  } else {
    // Normal path with keep claims
    // Gate 2: Every Evidence fact-claim has >= 1 support citation with valid claim_span inside markdown
    if (input.evidence.length === 0) {
      errors.push("Critic has keep claims but Evidence section has none.");
    }

    for (const item of input.evidence) {
      const supportCitations = item.citations.filter(
        (c) => c.citation_type === "support"
      );
      if (supportCitations.length === 0) {
        errors.push(`Claim "${item.claim}" lacks a supporting citation.`);
      }

      for (const cit of supportCitations) {
        if (!cit.claim_span) {
          errors.push(`Citation for "${item.claim}" missing claim_span.`);
        } else {
          const { start, end } = cit.claim_span;
          if (start < 0 || end > input.markdown.length || start >= end) {
            errors.push(
              `Invalid claim_span [${start}, ${end}] for claim "${item.claim}".`
            );
          } else {
            const substring = input.markdown.slice(start, end);
            if (!item.claim.includes(substring) && !substring.includes(item.claim)) {
              errors.push(
                `claim_span [${start}, ${end}] text "${substring}" does not match claim "${item.claim}".`
              );
            }
          }
        }
      }
    }
  }

  // Gate 3: Home mode has zero source_class=web support citations
  if (input.mode === "home") {
    for (const item of input.evidence) {
      for (const cit of item.citations) {
        if (cit.source_class === "web" && cit.citation_type === "support") {
          errors.push(
            `Home mode brief contains web support citation for claim "${item.claim}".`
          );
        }
      }
    }
  }

  // Gate 4: Every failed connector appears in unchecked or Could not be checked
  for (const uncheck of input.unchecked) {
    const inWhatIUsed = input.sections.what_i_used.unchecked.some((u) =>
      u.toLowerCase().includes(uncheck.connector.toLowerCase())
    );
    if (!inWhatIUsed) {
      errors.push(
        `Failed connector "${uncheck.connector}" is missing from 'Could not be checked'.`
      );
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      status: "failed",
      errors,
    };
  }

  return {
    valid: true,
    status: "published",
    errors: [],
  };
}
