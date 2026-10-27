# VERCODE — Compliance Considerations

The compliance posture VERCODE is designed to meet, and where the work is contractual/operational vs. architectural. This is *consideration*, not legal advice — the org should confirm each control with counsel before making enterprise commitments.

## 1. The frameworks that matter for a dev-tools SaaS

| Framework | Relevance | VERCODE's posture |
| --- | --- | --- |
| **SOC 2 Type II** | The #1 enterprise requirement (security, availability, confidentiality) | Designed for it: tenant isolation, audit logging (180 d min), access controls, change management, incident response, monitoring. *The attestation itself is a third-party audit — the architecture provides the evidence, the auditor does the attestation.* |
| **GDPR / data-protection** | EU data subjects; the code is *their* IP + their data-subject context | Data minimization (ephemeral content, bounded provider context), erasure (org-delete cascade + retention hard-purge), access/export (AC-405), a DPA + sub-processor list, data-residency path (Phase 3) |
| **PCI-DSS** | No longer applicable | **Out of scope** — the billing feature (Stripe/Razorpay) was removed in the no-paywall change; VERCODE no longer touches payment data at all (no processor, no tokenized customer id). The compliance story now centers on **OAuth token handling** (`users.github_provider_token`, per-user, server-side only) and **usage-data retention** (`usage_events`, 24 mo) |
| **HIPAA** | Not in scope for a dev-tools product (no PHI) | No commitment; a future regulated-vertical deployment would need it assessed separately |
| **India DPDP Act** | The target market (`ADR-009` INR focus) | Data-principal rights (access/erasure/correction) map to the retention + export + org-delete capabilities; per-user GitHub OAuth token handling + usage-data retention are the India-market data obligations that remain (no payment data is collected) |

## 2. The architectural evidence a SOC 2 / enterprise review will look for

| Control family (CC) | What VERCODE provides (the evidence) |
| --- | --- |
| **CC1–2 (Control Environment)** | Role-based access (PRD §6 matrix), least-privilege GitHub scopes (FR-210), no shared credentials, the "hide never enforce" rule |
| **CC5 (Risk Assessment)** | `THREAT_MODEL.md` (STRIDE, T-01…T-13, T-15, T-16) + `RISK_REGISTER.md` — a maintained, threat-specific risk register |
| **CC6 (Change Mgmt)** | Versioned Prisma migrations with rollback notes (`MIGRATION_STRATEGY.md`); a contract-pinned API (`OPENAPI.yaml` CI gate); dependency lockfile + audit gate |
| **CC7 (Monitoring)** | Structured logs + OTel + Sentry + metrics (TRD §15); a DLQ + queue-age + cost/review dashboard; a "failure is observable" invariant (DEFINITION OF DONE #12) |
| **CC7.2 / CC6.1 (Logging / Audit)** | Append-only `audit_events` (180 d min) capturing actor, action, target, IP, time — the SOC 2 "who did what" log; every authorization denial is audited (`AUTHORIZATION.md` §8) |
| **CC8 (Communications)** | An incident-response runbook (`OPERATIONS/INCIDENT_RESPONSE.md`) + the security-test plan as the verification of controls |
| **CC9 (Ops / Availability)** | 99.5% target; queue decoupling (NFR-12); graceful shutdown; PITR backup (`BACKUP_RESTORE.md`) |
| **CC9.6 / CC9.7 (Business Continuity / DR)** | `OPERATIONS/DISASTER_RECOVERY.md` + `BACKUP_RESTORE.md` |
| **Data-security (CI family)** | `SECRETS_MANAGEMENT.md` (KMS-wrapped BYOK, redaction gate), `TENANT_ISOLATION.md` (the 404-oracle rule), `DATA_RETENTION.md` (erasure) |

The point: **every control family has a named artifact in this documentation package.** A SOC 2 auditor can map their questionnaire to the docs; the implementation is what makes the docs *true*.

## 3. The contractual/operational items (not closed by architecture alone)

| Item | Status | Owner |
| --- | --- | --- |
| A signed **DPA** with the AI provider (no-training on payload) | Contractual — verify at integration (NFR-29) | Legal + Platform |
| A **sub-processor list** (AI provider, GitHub OAuth, observability, hosting) | Operational — maintained, published to enterprise prospects | Legal + Platform |
| **GitHub OAuth token handling + usage-data retention obligations** (the post-billing compliance surface) | Operational — `users.github_provider_token` is a per-user credential with revocation on disconnect; `usage_events` carry a 24-mo retention. Re-framed from the removed billing/PCI scope (`PRIVACY.md` §3) | Legal + Platform |
| **Data-residency regions** for regulated orgs | Phase 3 (the architecture is region-portable; the *region* is the work) | Platform |
| **The SOC 2 audit itself** | Third-party attestation (the architecture is the evidence; the auditor is the attestor) | Comms + Auditor |
| **Enterprise SSO (SAML/OIDC) + SCIM** | Phase 1/3 (`FEATURE_ROADMAP.md`) — an enterprise-onboarding requirement | Platform |

## 4. The audit-trail adequacy check

A compliance reviewer will ask: *can we reconstruct "who did what, when, and why" for a tenant?* The answer is **yes, within the retention window**, because:

- `audit_events` is **append-only** (no update/delete path — a mutation of the audit record is structurally impossible through the API; only a retention hard-delete expires it by age, and the 180 d floor is a compliance minimum, `NFR-27`).
- Every state change (role change, rule change, key rotation, review skip, install removal, plan change) writes an audit row at the point of the change (not a diff-after-the-fact) — `DATABASE_DESIGN.md` §7.
- Authorization *denials* are audited too (`AUTHORIZATION.md` §8) — an attack or misconfiguration is reconstructable, not just the successful actions.
- The audit log's retention (180 d min) *exceeds* the finding retention for the free/developer tiers — so an investigator can see *that* a review happened even after the findings expire (the audit is the longer-lived record, by design).

## 5. The "we don't claim what we can't verify" rule

Compliance claims (SOC 2, DPDP, "we don't train on your code") are only made where:
- **The architectural control exists and is tested** (the security suite proves it), *and*
- **The contractual/operational item is closed** (a signed DPA, a verified provider no-training classification).

A claim that's *only* contractual (e.g., "the provider won't train on your code") is phrased as *"the integration uses the provider's no-training classification; verified against the provider's DPA at integration"* — not as an absolute, because the absolute is the provider's contract, not our code. This is the same "don't claim what you can't verify" rule as the deploy/benchmark claims (PHASE 10, TESTING/BENCHMARK_DATASET.md).

## 6. Residual compliance risks (accepted, documented)

- **Provider sub-processor change:** a provider adding a sub-processor or changing its data-handling is outside VERCODE's control — *mitigation:* the DPA's change-notice clause + a re-verification checkpoint; a BYOK/Ollama path removes the dependency for the most sensitive orgs.
- **Region concentration:** the MVP is single-region; a region outage is an availability event, not a residency breach (a residency commitment is a Phase-3 feature) — *mitigation:* PITR + DR runbook; the residency commitment is *not made* until Phase 3 delivers it.
- **OAuth token handling + usage-data retention (the post-billing surface):** the per-user GitHub OAuth token is a customer credential — *mitigation:* server-side storage only, revocation on disconnect, token never to browser/log (`PRIVACY.md` §3); usage data retains for 24 mo by the schedule in `DATA_RETENTION.md`.
