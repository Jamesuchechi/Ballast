export type SourceClass = "private" | "web" | "system";

export type CitationType = "support" | "conflict" | "missing" | "unchecked";

export type ConnectorType =
  | "gmail"
  | "github"
  | "calendar"
  | "drive"
  | "slack"
  | "notion"
  | "upload"
  | "web";

export type BriefMode = "home" | "world";

export type BriefStatus =
  | "queued"
  | "running"
  | "needs_review"
  | "published"
  | "failed";

export interface SourceBlock {
  id: string;
  source_id?: string;
  class: "private" | "web";
  connector: string;
  body: string;
}

export interface RetrievedQuote {
  id: string;
  source_id: string;
  source_class: "private" | "web";
  connector: ConnectorType;
  quote: string;
  url?: string | null;
  distance?: number;
  similarity?: number;
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
  summary?: string;
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

export type ConflictResolutionStatus =
  | "unresolved"
  | "confirmed_accurate"
  | "dismissed"
  | "superseded";

export interface ConflictResolutionMemory {
  id: string;
  workspace_id: string;
  brief_id?: string | null;
  citation_id?: string | null;
  source_id?: string | null;
  topic: string;
  resolution_type: "confirmed_accurate" | "dismissed" | "superseded";
  user_note?: string | null;
  quote?: string | null;
  connector?: string | null;
  created_at: string;
}

export interface CriticInput {
  question: string;
  mode: BriefMode;
  retrieved: RetrievedQuote[];
  draft_brief: DraftBrief;
  unchecked: UncheckedConnector[];
  resolved_conflicts?: ConflictResolutionMemory[];
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
  resolution_status?: ConflictResolutionStatus;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_note?: string | null;
}

export interface PublishedEvidenceItem {
  claim: string;
  citations: CitationRecord[];
}

export interface PublishedBriefSections {
  summary?: string;
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
  summary?: string | null;
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
