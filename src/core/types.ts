export type SourceClass = "private" | "web" | "system";

export type CitationType = "support" | "conflict" | "missing" | "unchecked";

export type ConnectorType = "gmail" | "github" | "calendar" | "upload" | "web";

export type BriefMode = "home" | "world";

export type BriefStatus =
  | "queued"
  | "running"
  | "needs_review"
  | "published"
  | "failed";

export interface RetrievedQuote {
  id: string;
  source_id: string;
  source_class: "private" | "web";
  connector: ConnectorType;
  quote: string;
  url?: string | null;
}

export interface UncheckedConnector {
  connector: string;
  error: string;
}

export interface DraftBriefEvidence {
  claim: string;
  citation_ids: string[];
}

export interface DraftBriefSections {
  answer: string;
  what_i_used: {
    private: string[];
    web: string[];
    unchecked: string[];
  };
  evidence: DraftBriefEvidence[];
  uncertain: string[];
  open_loops: string[];
  actions: string[];
  what_i_did_not_do: string[];
}

export interface DraftBrief {
  title: string;
  sections: DraftBriefSections;
}

export interface CriticInput {
  question: string;
  mode: BriefMode;
  retrieved: RetrievedQuote[];
  draft_brief: DraftBrief;
  unchecked: UncheckedConnector[];
}

export type DropReason = "unsourced" | "off-mode" | "injection" | "other";

export interface KeepClaim {
  claim: string;
  citation_ids: string[];
}

export interface DropClaim {
  claim: string;
  reason: DropReason;
}

export interface ConflictClaim {
  topic: string;
  citation_ids: string[];
}

export interface MissingGap {
  gap: string;
}

export interface CriticOutput {
  keep: KeepClaim[];
  drop: DropClaim[];
  conflicts: ConflictClaim[];
  missing: MissingGap[];
  did_not: string[];
}

export interface ClaimSpan {
  start: number;
  end: number;
}

export interface CitationRecord {
  id?: string;
  workspace_id?: string;
  brief_id?: string;
  source_class: SourceClass;
  citation_type: CitationType;
  quote: string;
  source_id?: string | null;
  url?: string | null;
  claim_span?: ClaimSpan;
}

export interface PublishedEvidenceItem {
  claim: string;
  citations: CitationRecord[];
}

export interface PublishedBriefSections {
  answer: string;
  what_i_used: {
    private: string[];
    web: string[];
    unchecked: string[];
  };
  evidence: PublishedEvidenceItem[];
  uncertain: string[];
  open_loops: string[];
  actions: string[];
  what_i_did_not_do: string[];
}

export interface BriefV1 {
  id: string;
  workspace_id: string;
  parent_brief_id: string | null;
  question: string;
  mode: BriefMode;
  status: BriefStatus;
  template_version: "v1";
  as_of: string;
  published_at: string | null;
  title: string;
  markdown: string;
  pdf_uri: string | null;
  error: string | null;
  sections: PublishedBriefSections;
}

export interface CriticLog {
  claims_in: number;
  claims_kept: number;
  claims_dropped: number;
  keep: KeepClaim[];
  drop: DropClaim[];
  conflicts: ConflictClaim[];
  missing: MissingGap[];
  did_not: string[];
}
