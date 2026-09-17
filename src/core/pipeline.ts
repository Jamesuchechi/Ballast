import { randomUUID } from "node:crypto";
import type {
  BriefMode,
  BriefV1,
  CriticInput,
  CriticLog,
  RetrievedQuote,
  UncheckedConnector,
} from "./types";
import type { SourceBlock } from "./sourceFormatter";
import { runWriter } from "./writer";
import { runCritic } from "./critic";
import { llmCall as defaultLlmCall } from "./llm";
import { assembleBrief } from "./assembler";

export interface GenerateBriefOptions {
  question: string;
  mode: BriefMode;
  sources: SourceBlock[];
  retrieved: RetrievedQuote[];
  unchecked?: UncheckedConnector[];
  workspaceId?: string;
  parentBriefId?: string | null;
  llmCall?: (prompt: string, systemPrompt: string) => Promise<string>;
}

export interface PipelineResult {
  brief: BriefV1;
  criticLog: CriticLog;
  success: boolean;
}

/**
 * Runs the complete Phase 0 generation pipeline:
 * retrieve -> draft -> critic -> json-schema validate -> publish validator -> render
 */
export async function generateBrief(
  options: GenerateBriefOptions
): Promise<PipelineResult> {
  const {
    question,
    mode,
    sources,
    retrieved,
    unchecked = [],
    workspaceId = "ws_dev",
    parentBriefId = null,
    llmCall: explicitLlmCall,
  } = options;

  const briefId = `brief_${randomUUID()}`;
  const asOf = new Date().toISOString();

  const isMockAllowed =
    process.env.EVAL_USE_MOCK === "true" || process.env.NODE_ENV === "test";

  const writerLlm =
    explicitLlmCall ??
    (!isMockAllowed
      ? (prompt: string, sys: string) => defaultLlmCall(prompt, sys, { role: "writer" })
      : undefined);

  const criticLlm =
    explicitLlmCall ??
    (!isMockAllowed
      ? (prompt: string, sys: string) => defaultLlmCall(prompt, sys, { role: "critic" })
      : undefined);

  // 1. Run Writer (internal draft, never directly published)
  const draft = await runWriter({
    question,
    mode,
    sources,
    retrieved,
    llmCall: writerLlm,
  });

  // 2. Prepare Critic Input
  const criticInput: CriticInput = {
    question,
    mode,
    retrieved,
    draft_brief: draft,
    unchecked,
  };

  // 3. Run Critic
  const criticOut = await runCritic({
    input: criticInput,
    llmCall: criticLlm,
  });

  // 4. Assemble Brief (shared pure assembly, rendering & validation)
  const assembled = assembleBrief({
    draft,
    criticOut,
    retrieved,
    sources,
    unchecked,
    question,
    mode,
    asOf,
  });

  const finalStatus = assembled.validation.valid ? "published" : "failed";
  const errorMessage = assembled.validation.valid
    ? null
    : assembled.validation.errors.join("; ");

  const brief: BriefV1 = {
    id: briefId,
    workspace_id: workspaceId,
    parent_brief_id: parentBriefId,
    question,
    mode,
    status: finalStatus,
    template_version: "v1",
    as_of: asOf,
    published_at: assembled.validation.valid ? asOf : null,
    title: assembled.title,
    markdown: assembled.markdown,
    pdf_uri: null,
    error: errorMessage,
    summary: assembled.summary || null,
    sections: assembled.sections,
  };

  return {
    brief,
    criticLog: assembled.criticLog,
    success: assembled.validation.valid,
  };
}

