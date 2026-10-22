# VERCODE — Privacy

The privacy posture: what data VERCODE collects, why, who it's shared with, and how it's minimized and erasable. This is the *data-subject* view (the customer's developers and their code), complementing the *platform* security docs.

## 1. The data VERCODE collects

| Data | Collected? | Why | Retention |
| --- | --- | --- | --- |
| Account (email, name) | Yes | Auth + profile | Life of account; erasable |
| Password | Hash only (Argon2id) | Auth | Life of account |
| Org membership + role | Yes | Tenancy + RBAC | Life of membership; audited |
| GitHub install + connected repos (metadata: name, default branch, id) | Yes | The integration | Life of install; purged on removal (retention) |
| **PR diff + bounded file context** | **Ephemeral** | The review input | **Not stored** (Redis 24 h cache only; NFR-28) |
| **Findings + summary** (bounded code snippets) | Yes | The product output | Plan retention (NFR-27) |
| Usage (tokens, cost, review count) | Yes | Billing + analytics | 24 mo |
| Audit events | Yes | Compliance | 180 d min |
| BYOK key | KMS-wrapped ciphertext | Org's own AI calls | Life of key; hard-purged on rotation/org-delete |
| IP address | Yes (audit source_ip) | Security + compliance | Audit retention |

**The defining privacy property: VERCODE is a review system, not a code host.** The *analysis* (findings) is the product; the *source code* is transient input. A customer's full codebase is **never** stored as a durable asset — only the bounded, quoted snippet inside a finding (plan-retained), and even that is *derived* data, not a copy of the repo.

## 2. Data minimization (the structural controls)

1. **Ephemeral content (NFR-28):** raw diffs/file contents live only in the Redis cache (24 h, org-scoped) and worker memory for the review's duration. There is *no* Postgres column for full file content (a schema-review gate asserts this, `ST-ephemeral-content`).
2. **Bounded context to providers (NFR-29):** a provider receives only the changed files + 1-hop imports within the token budget — **never the whole repo**. The provider's exposure to a customer's code is scoped, small, and by-contract non-training (verified at integration).
3. **No telemetry on code content:** VERCODE does not collect "which code patterns are common" analytics — the usage analytics are about *reviews/findings/cost*, not *code content* (no code-shape telemetry to a third party).
4. **Prompt minimization:** the review system prompt is small and static (PROMPT_ENGINEERING §1.3); the only repo-derived data in a prompt is the bounded context (delimited + untrusted-labeled).

## 3. Third-party data flows (the disclosures)

| Recipient | What's shared | Contract |
| --- | --- | --- |
| **AI provider** (OpenAI/Anthropic/Ollama) | Bounded review context (changed files + 1-hop, token-capped) + the assembled prompt | The integration uses the provider's **no-training / zero-retention** classification where available (a data-processing addendum or the provider's business-tier "data is not used for training" setting); a BYOK/Ollama path lets an org keep the data on *their own* provider key / self-hosted model (the strongest control, for data-residency orgs) |
| **GitHub** | The review (summary + inline comments) on the PR | The review is *posted content* the org asked for; the App's least-privilege scopes mean VERCODE reads only what it needs (FR-210) |
| **Billing provider** (Stripe/Razorpay) | The org's subscription + payment metadata (card data is **tokenized by the provider — VERCODE never sees the PAN**) | PCI-DSS scope stays with the provider; VERCODE stores only the provider's customer/subscription id + plan state |
| **Sentry / OTel collector** | Error + trace data | PII/secret scrubbed (no user email, no code content, no secrets in breadcrumbs/captures) |

**The PCI point matters:** VERCODE is *not* in PCI cardholder-data scope — the provider tokenizes the card; VERCODE stores the tokenized customer id. This is a scope-reduction that's part of the billing design (INTEGRATION_DESIGN §2).

## 4. Data-subject rights (the "erasable + exportable" posture)

| Right | How |
| --- | --- |
| **Access** | The org's owner/admin can see all of their org's data (findings, usage, audit, config) in the dashboard; an export is available (AC-405) |
| **Erasure** | `org.delete` → soft-delete + grace → hard-purge cascade (tenant rows); BYOK KMS keys are destroyed; retention hard-deletes expire findings/usage/audit on schedule |
| **Access revocation** | `installation.deleted` → immediate content eviction + embedding-index (P2) hard-delete (FR-404, NFR-28) |
| **Export-before-delete** | A download of the org's findings/usage is offered in the grace window before the hard-purge (retention §6) |
| **Correction** | Account data (email, name) is user-editable; a review's findings are *analysis* (immutable analysis-of-a-commit — a correction is a *re-review at a new commit*, not an edit of the old finding) |

## 5. The "analysis is immutable, not mutable" privacy choice

A finding is an **analysis of a specific commit** — it's a record, not a mutable document. We do **not** offer "edit a finding" (that would let a tenant mutate their own audit/analysis record, breaking the record-keeping integrity). The correct path for "this finding is wrong" is: dismiss it (a `finding_action`, which is *appended*, not a mutation) or re-review at a new commit. This is both an integrity choice (append-only analysis history) and a privacy choice (a tenant can't rewrite the record of what was observed).

## 6. Compliance posture (see COMPLIANCE_CONSIDERATIONS.md for the deep dive)

- **Data residency:** the MVP is single-region (the Postgres/Redis region). Enterprise data-residency commitments (per-region deployment) are a Phase-3 capability (the architecture is region-portable — state lives in Postgres + Redis, no region-coupled logic).
- **Sub-processors:** the AI provider, the billing provider, and the observability stack are *sub-processors*; the DPA/sub-processor list is maintained (compliance doc). A BYOK/Ollama path *reduces* the AI sub-processor exposure for sensitive orgs.
- **The "no training on your code" commitment is structural + contractual:** structurally (bounded context, ephemeral content, no code telemetry) *and* contractually (the provider's no-training classification / DPA). A customer can verify the structural side (we can show what's in a provider call — it's bounded and scoped); the contractual side is the provider's DPA.

## 7. What we deliberately do not collect

- **No IDE/keystroke telemetry, no code-completion data, no editor state** — VERCODE is PR-scoped, not IDE-scoped.
- **No code-content analytics** shared with a third party (usage analytics are about the *review*, not the *code*).
- **No card data** (PCI scope reduction, §3).
- **No whole-repo copies** (ephemeral content, §2.1).
