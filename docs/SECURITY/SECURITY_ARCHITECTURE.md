# VERCODE — Security Architecture

The security architecture, by layer. Each layer names the threats it closes (mapped to `THREAT_MODEL.md`) and the verification test that proves it.

## 1. Trust model overview

VERCODE has **three trust domains** and two ingress points:

```
[untrusted] repo content, PR bodies, third-party forks, AI providers (their output), webhook payloads
      │
      ▼ (signature-verified ingress)
[platform]  API + worker + Postgres + Redis   ← the trusted core
      │
      ▼ (server-enforced tenancy + capability)
[tenant]    one org's data, never reachable without its org_id binding
```

The core invariant: **repository content is *input*, never *authority*.** The untrusted domain can supply data (code, PR text) and, at most, get a *finding about itself*; it cannot move an org's state, call VERCODE tools, leak platform secrets, or cross a tenant boundary.

## 2. Layered controls

### 2.1 Ingress (the two machine paths)
- **GitHub webhook:** HMAC-SHA256 + 5-min timestamp window + 24 h delivery-id dedup (`WEBHOOK_SPECIFICATION.md`). A forged event fails the signature; a captured event fails the window/dedup.
- **GitHub OAuth (per-user connect):** state-token anti-CSRF (single-use, 10-min TTL, `github_oauth_states`); the exchanged token is stored server-side per user, never sent to the browser or logged.
- **Human path:** cookie session, Argon2id, server-side revocation, no user enumeration (`AUTHENTICATION.md`).

### 2.2 Authorization (tenant + capability)
- **Tenancy:** every data access is `org_id`-scoped at the repository layer; cross-org → 404 (no oracle) (`TENANT_ISOLATION.md`).
- **Capability:** RBAC matrix enforced at route + service (`AUTHORIZATION.md`); the UI hides, the API enforces.

### 2.3 Data protection
- **At rest:** Postgres at-rest encryption (managed) + KMS-wrapped BYOK keys (the raw provider key is never in a DB column).
- **In transit:** TLS 1.2+ everywhere (API, DB, Redis, provider calls).
- **Secrets:** env + KMS; no secret in a log line, finding, prompt, or browser payload (the redaction pass is *on every log record*, AC-903).
- **Minimization:** raw repo content is ephemeral (Redis 24 h), not stored (NFR-28, `DATA_RETENTION.md` §3).

### 2.4 The AI boundary
- **Prompt injection:** repo content delimited as untrusted data; no tool access in review mode; output schema-validated; a leaked prompt doesn't parse as a finding (`PROMPT_INJECTION_DEFENSE.md`).
- **Provider trust:** the provider's *claimed* structured output is re-validated (Zod) — a provider bug or a manipulated provider response can't smuggle a malformed finding through (`AI_SYSTEM_DESIGN.md` invariant 1).
- **BYOK isolation:** an org's key is KMS-wrapped, decrypted only in the worker process in KMS scope, never in a queue payload or log.

### 2.5 Execution boundary
- **No untrusted code execution in MVP** (ADR-008). Static analysis runs as a *worker sub-process* with CPU/mem limits and no production credentials. The full sandbox (running a PR's own tests) is a Phase-2 isolation boundary (`SANDBOX_SECURITY.md`).

### 2.6 Audit & recovery
- **Append-only `audit_events`** (180 d min) for every state change + every authorization denial.
- **Postgres PITR** + daily logical dumps (`OPERATIONS/BACKUP_RESTORE.md`).
- **Retention hard-deletes** are scheduled, org-scoped, and alerted-on (a retention failure is a compliance incident).

## 3. The threat-to-control-to-test matrix (summary)

The full STRIDE analysis is in `THREAT_MODEL.md` (T-01…T-13, T-15, T-16); the test plan that proves each mitigation is in `SECURITY_TEST_PLAN.md`. This table is the *architecture* view:

| Threat (id) | Control layer | Verification |
| --- | --- | --- |
| Forged/replayed webhook (T-01) | Ingress HMAC + dedup + window | `IT-webhook-forged`, `IT-webhook-replay` |
| Cross-tenant access (T-02) | Tenancy repository scoping | `IT-tenant-01..05`, `ST-isolation-oracle` |
| Auth bypass / session hijack (T-03) | Argon2id + hashed session + revocation + lockout | `IT-auth-*`, `IT-session-*` |
| GitHub token/install compromise (T-04) | App-only auth, least-privilege scopes, install not exposed to browser | `ST-github-scopes`, install-permission audit |
| AI provider key exposure (T-05) | KMS-wrapped BYOK; platform key in env/KMS; never in DB/log/prompt | `ST-secret-leak`, `ST-byok-wrapped` |
| Prompt injection (T-06) | Delimited data + no tools + schema validation + redaction | `ST-injection-01..04` |
| Malicious source files (T-07) | No execution in MVP; static analysis resource-capped; content never stored | `ST-malicious-file`, `ST-context-clean` |
| Unsafe code execution (T-08) | Absent in MVP (ADR-008); Phase-2 sandbox boundary designed | `ST-sandbox-*` (Phase 2) |
| Dependency vulnerability (T-09) | Dependency audit in CI; minimal dependency surface; pinned versions | CI `pnpm audit` gate |
| Denial of service (T-10) | Per-org/user RPS limits; webhook constant-latency; queue backpressure | `IT-rate-01/02` |
| API cost abuse (T-11) | Platform token-spend cap + re-review rate limit + usage reporting + skip-with-notice | `ST-cost-abuse` |
| Source-code leakage (T-12) | Ephemeral content; no whole-repo to providers; tenant isolation | `ST-context-bound`, `IT-tenant-*` |
| Data retention violation (T-13) | Scheduled hard-purge; ephemeral content; export-before-delete | `IT-retention-01..03` |
| Admin privilege escalation (T-15) | Capability matrix + one-owner invariant + owner-transfer atomicity + audit | `IT-authz-*` |
| Supply chain (T-16) | pnpm lockfile; no arbitrary build scripts (the `allowBuilds` policy is explicit); dependency audit | CI supply-chain gate |

## 4. Design rules that are security invariants

1. **The repository is the only place a query touches tenant data**, and it is `org_id`-scoped by construction (no "return all" method exists).
2. **The webhook path does no LLM work** — an attacker who floods webhooks fills the queue, they can't burn the provider budget or the dashboard's latency (the ingress is constant-latency).
3. **Cost controls are server-side only** — usage reporting (`usage_events`) and the platform token-spend cap (`PLATFORM_TOKEN_SPEND_CAP_USD`) are authoritative; a client-supplied claim about spend or entitlement moves nothing (T-11).
4. **A skip is never silent** — every cap/rate stoppage leaves a user-visible record, which is simultaneously the UX rule and the abuse-detection signal (T-11).
5. **The redactor runs on every log record and every stored finding** — a secret that reaches a log or a finding is a *released* secret, so the redaction is a *gate*, not a best-effort (T-05, T-12).
