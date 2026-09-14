# Ballast Security and Privacy Policy (v1)

**Effective Date:** September 14, 2026  
**Status:** Normative Architecture Contract  
**Maps to:** NFR1 (Security), NFR2 (Privacy & Compliance), Closed Decisions #2 and #7.

---

## 1. Grounding & Data Boundaries

1. **Untrusted Data Boundary (NFR1.1):** Ingested content (mail, git comments, drive files, web pages, uploads) is treated as untrusted data. Payloads are strictly delimited in prompt formatting and never executed as instructions.
2. **Prompt-Injection Defense (NFR1.5):** All source content passes through the Grounding Critic and the full pipeline. Hidden instructions in footers, HTML comments, PDF asides, or role manipulation are detected, dropped, and recorded under *What I did not do*.
3. **Home vs. World Mode Tool Router (NFR1.6):** Enforced in the tool router using stored brief `mode`. The model cannot enable web search by conversational instruction alone.
4. **No Training on User Content (NFR2.5):** User source documents, synced payloads, embeddings, and generated briefs are **never** used to train, retrain, or fine-tune public foundation models.

---

## 2. Encryption & Secrets Management

1. **Payload Encryption at Rest (NFR1.3):** All files, uploads, and cached source payloads stored in the object store (`.storage/`) are encrypted at rest using **AES-256-GCM** with a 96-bit unique IV and 128-bit authentication tag.
2. **OAuth Secrets Manager (NFR1.2):** OAuth tokens and secrets are encrypted at rest with AES-256-GCM in PostgreSQL (`oauth_tokens`). Plaintext tokens are never logged, never exposed via UI, and rotated upon token refresh or revoke.
3. **Minimum Scope Principle (NFR1.4):** Connectors request minimum-necessary read scopes by default. Write/draft scopes (e.g. Gmail send, GitHub issue creation) are only requested when Actions are explicitly enabled for the workspace.
4. **Data in Transit (NFR1.3):** All external API exchanges (Google, GitHub, Slack, Notion) occur over TLS 1.3.

---

## 3. Retention Policies per Source Type (NFR2.1)

Retention windows define the maximum age of synced sources and derived chunks before automated pruning. Configured and visible per workspace:

| Source Type | Default Window | Configurable Range | Prune Target |
| :--- | :--- | :--- | :--- |
| **Gmail** | 90 days | 7 – 365 days | Old threads, attachments, chunks, embeddings |
| **GitHub** | 30 days | 7 – 180 days | Old closed PRs, issues, diff chunks |
| **Slack** | 30 days | 7 – 90 days | Ingested thread messages and channel chunks |
| **Notion** | 90 days | 14 – 365 days | Synced doc snapshots, chunks, embeddings |
| **Google Drive** | 90 days | 14 – 365 days | Synced files and vector representations |
| **Google Calendar** | 14 days | 7 – 60 days | Past events and invite notes |
| **Uploads / Pastes** | 365 days | 7 – 3650 days | Manual upload payloads, vectors, storage bytes |
| **Web Citations** | 7 days | 1 – 30 days | Ephemeral search snapshots (World mode) |

---

## 4. Deletion & Wipe Policy (NFR2.2, Closed Decision #2)

1. **Per-Source Deletion:** Deleting a source deletes its record from `sources`, cascades deletion to all derived `chunks` and vector embeddings, physically unlinks any encrypted files in `objectStore`, removes citations, and logs an access audit entry.
2. **Pre-Wipe Export First:** Workspace owners can download a complete, structured JSON archive (`/api/workspace/export`) of all briefs, citations, sources metadata, and action logs before wiping.
3. **Full-Account Server-Side Wipe:** Invoking `/api/workspace/wipe` with confirmation `DELETE_MY_WORKSPACE` permanently destroys:
   - All sources, chunks, and vector embeddings.
   - All briefs, citations, actions, runs, and schedules (**no retained briefs after delete**).
   - All encrypted OAuth tokens and secrets.
   - All physical object store files on disk.
   - All audit logs and notification rows.

---

## 5. Third-Party PII & Export Access Control (NFR2.3, NFR2.6)

1. **Third-Party PII Protection (NFR2.3):** Email headers, reviewer identities, and third-party communications retrieved into Ballast are treated as workspace-confidential. Exports and PDF artifacts are restricted to authenticated members of the workspace.
2. **No Public Share Links in v1 (Dated: Not in v1 as of September 2026):** Brief links and PDF download URLs are **not** public. Guessable URLs without active authenticated workspace session cookies return `HTTP 401 Unauthorized`.
3. **Action Approvals (NFR1.7):** Action execution tokens are strictly bound to authenticated session cookies with workspace owner or member rights. No unauthenticated "approve" links exist.

---

## 6. Access Audit Logging (NFR2.4, NFR6.4)

1. **Audited Access:** All source reads (sync, brief retrieval), credential updates (token store, token rotate, token revoke), and data mutations (source deletion, retention prune, account wipe) are logged in `access_logs`.
2. **Owner-Gated Querying:** Only authenticated users with the `owner` role can query access logs via `/api/access-logs`. Member accounts receive `HTTP 403 Forbidden`. Filterable by connector, action, and date range.

---

## 7. Clause Mapping Table (Exit Criterion)

Every policy clause maps to a concrete test, an architectural control, or a dated "not in v1":

| Clause ID | Description | Type | Enforcement Mechanism / Verification Reference |
| :--- | :--- | :--- | :--- |
| **SEC-01** | Ingested content treated as untrusted data | **Control & Test** | `src/core/sourceFormatter.ts`, verified in `test/phase8_security_hardening.test.ts` (Test 1) |
| **SEC-02** | Prompt injection dropped by Critic & Pipeline | **Control & Test** | `src/core/critic.ts` (`INJECTION_PATTERNS`), verified in `test/phase8_security_hardening.test.ts` (Test 1 & 2) |
| **SEC-03** | Home vs World mode enforced in tool router | **Control & Test** | `src/core/router.ts` & `src/core/retrieval.ts`, verified in `eval/fixtures/03_mixed_dump` |
| **SEC-04** | No model training on user source content | **Control** | Contractual API terms (zero retention) + local embedding storage (`src/core/llm.ts`) |
| **SEC-05** | Payload encryption at rest (AES-256-GCM) | **Control & Test** | `src/storage/objectStore.ts`, verified in `test/phase8_security_hardening.test.ts` (Test 3) |
| **SEC-06** | OAuth token encryption at rest | **Control & Test** | `src/connectors/tokenStore.ts` & `src/core/secretsManager.ts`, verified in `test/phase8_security_hardening.test.ts` (Test 4) |
| **SEC-07** | Minimum-necessary connector scopes | **Control** | `src/connectors/gmail.ts`, `src/connectors/github.ts` (read-only by default) |
| **PRIV-01** | Retention policy visible per source type | **Control & Test** | `src/core/retention.ts`, `/api/retention`, verified in `test/phase8_security_hardening.test.ts` (Test 7) |
| **PRIV-02** | Automated pruning of expired sources | **Control & Test** | `pruneExpiredSources` in `src/core/retention.ts`, verified in `test/phase8_security_hardening.test.ts` (Test 7) |
| **PRIV-03** | Per-source deletion removes chunks & object bytes | **Control & Test** | `deleteSource` in `src/core/deletion.ts`, verified in `test/phase8_security_hardening.test.ts` (Test 5) |
| **PRIV-04** | Pre-wipe export before account delete | **Control & Test** | `exportWorkspaceData` in `src/core/deletion.ts`, verified in `test/phase8_security_hardening.test.ts` (Test 6) |
| **PRIV-05** | Full account wipe removes all briefs & vectors | **Control & Test** | `wipeWorkspaceAccount` in `src/core/deletion.ts`, verified in `test/phase8_security_hardening.test.ts` (Test 6) |
| **PRIV-06** | No retained briefs after account deletion | **Control & Test** | Closed Decision #2, verified in `test/phase8_security_hardening.test.ts` (Test 6) |
| **PRIV-07** | No public share links in v1 | **Dated Not in v1** | *Not in v1 as of September 2026*. Download endpoints strictly enforce session cookies (`src/app/api/briefs/[id]/pdf/route.ts`), verified in `test/phase8_security_hardening.test.ts` (Test 8) |
| **AUD-01** | Access logs record source reads & mutations | **Control & Test** | `src/core/retrieval.ts`, `src/core/deletion.ts`, verified in `test/phase8_security_hardening.test.ts` (Test 5, 8) |
| **AUD-02** | Access logs queryable by workspace owner only | **Control & Test** | `/api/access-logs` (role check `owner`), non-owners get 403, verified in `test/phase8_security_hardening.test.ts` (Test 8) |
