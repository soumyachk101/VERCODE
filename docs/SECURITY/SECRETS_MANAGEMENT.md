# VERCODE — Secrets Management

Where every secret in the system lives, how it's protected, and the invariant that a secret *never* reaches a log line, a finding, a prompt, a queue payload, or the browser.

## 1. The secret inventory

| Secret | Purpose | Resting home | Exposure surface |
| --- | --- | --- | --- |
| `POSTGRES_URL` | DB | Deploy env (secret store) | worker/api only |
| `REDIS_URL` | Queue/session/cache | Deploy env | worker/api only |
| `GITHUB_APP_ID` | App auth | Deploy env | api/worker (github pkg) |
| `GITHUB_APP_PRIVATE_KEY` (PEM) | App JWT signing | **KMS-wrapped** (decrypted in-process, TTL) | api/worker, never persisted plaintext to disk beyond the KMS envelope |
| `GITHUB_WEBHOOK_SECRET` | Webhook HMAC | Deploy env | api (webhook route) |
| `OPENAI_API_KEY` (platform default) | AI calls | Deploy env / KMS | worker (ai-providers) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Per-user GitHub OAuth ("Connect GitHub"; a separate GitHub *OAuth App* from the GitHub App above) | Deploy env (secret store; `.env.example` holds placeholders only) | api (OAuth token exchange), never sent to the browser or persisted plaintext beyond the per-user `users.github_provider_token` |
| `SESSION_SIGNING_KEY` | Session cookie signing | Deploy env | api |
| `SENTRY_DSN` / OTLP endpoint | Observability | Deploy env | all |
| **BYOK provider keys (per org)** | Org's own AI calls | **Postgres `byok_keys.wrapped_key` (KMS-wrapped ciphertext)** | worker only, decrypted in KMS scope, KMS-scoped to the org |

**The rule: a secret is either (a) in the deploy secret store / env, or (b) KMS-wrapped in Postgres for the org-scoped BYOK case. It is never in plaintext in a DB column, a log, a finding, a prompt, a queue payload, or the browser.**

## 2. KMS-wrapped BYOK (the interesting case)

An org's BYOK key is **not** stored raw:

```
org supplies key (admin action, integrations.manage)
  → encrypt: AES-256-GCM(data key), where the data key is wrapped by KMS
    (or directly: KMS `Encrypt(plaintext=key)` under a per-org KMS CMK)
  → store: byok_keys.wrapped_key = ciphertext, kms_key_id, key_prefix (last-4), active
  → at use: worker calls KMS Decrypt (scoped to the org's KMS key) → the raw key lives only
    in the worker process memory, for the duration of the org's provider calls
```

- **The API never returns the raw key** — only `key_prefix` (last-4) + `active` (FR-313). The dashboard shows `sk-...abcd` style masking; there is no "reveal" button (the raw key is not retrievable by design — only a rotation replaces it).
- **KMS scoping:** the KMS key (or key *usage policy*) is scoped so the worker can decrypt only the org's own BYOK key — a cross-org key read is a KMS-policy denial (defense in depth on top of tenancy).
- **Rotation:** setting a new key wraps the new key, marks it `active`, and deactivates the old one (old key's ciphertext is retained for the retention window for audit, then hard-deleted — a rotation is a *re-key*, not a *re-use of the old key*).
- **A KMS outage degrades gracefully:** if KMS is unavailable, the org's *BYOK* calls are skipped (with a notice), and the *platform-default-key* path (if the org has one) is unaffected (the platform key is in env, not KMS).

## 3. The redaction gate (the invariant's enforcement)

The single most important control is that a secret that *appears* (in a finding, a log, a provider echo) is **redacted before it's stored or emitted**:

- **`observability.redact(text)`** scans for a battery of patterns (OpenAI/Anthropic/Stripe/GitHub key shapes, `sk-...`, `ghp_...`, `pk_live_...`, PEM blocks, `DATABASE_URL=`, JWT `eyJ...`, and a generic high-entropy token detector) and masks them to their type + last-4 (`OPENAI_API_KEY=***`, `sk-...abcd`).
- **It runs on:** every structured log record *before* it's written (the logger's transport); every `review_findings.payload` *before* it's stored (the engine's post-processing); every *prompt* assembled for a provider call (pre-send) — so a secret in a code sample the PR added is masked before it even reaches the provider (and thus can't be echoed back into a finding).
- **The redaction is a *gate*, not best-effort:** the security suite asserts (`ST-secret-leak`) that a review whose code contains a literal `sk-...` key results in **zero** occurrences of that key in (a) the stored finding, (b) the logs, (c) the provider-bound prompt (as an echo). A miss is a release-gating defect.

## 4. Deploy-time secret handling

- **No secret in the image.** Dockerfiles build from the manifest only; secrets are injected at deploy time (the platform's secret store → env), never baked into a layer (a secret in a layer is in the registry, forever).
- **No secret in the repo.** `.env.example` holds **placeholders only** (`OPENAI_API_KEY=your-openai-key-here`); real secrets live in the deploy secret store (a CI/CD secret, or the platform's vault). A committed `.env` with real values is a CI-detectable defect (a secret-scanning gate).
- **KMS for the App private key:** `GITHUB_APP_PRIVATE_KEY` is KMS-wrapped at rest; the process decrypts it on boot into memory (TTL), signs JWTs there. A deploy-environment leak doesn't yield the private key in plaintext from the secret store's at-rest copy.

## 5. The "no secret in these places" test matrix

| Place | Test | Assertion |
| --- | --- | --- |
| Log line | `ST-redaction-01` | A run that logs an env-var-shaped string emits it masked |
| Stored finding | `ST-secret-leak` | A PR that adds a literal key → the stored finding's payload is masked, the raw key absent |
| Provider-bound prompt | `ST-secret-leak` (prompt-echo sub-case) | The provider never receives the raw platform key; a repo key sample is masked into the prompt |
| Browser payload | `ST-byok-wrapped` + a web payload check | The API never returns a raw BYOK or a platform key; only the masked last-4 |
| Queue payload | a payload scan in the security suite | A job payload carries `jobId` + pointers only, no secret |
| DB column (BYOK) | `ST-byok-wrapped` | `byok_keys` holds ciphertext + KMS key id + last-4 only |

## 6. Secret lifecycle

| Event | Action |
| --- | --- |
| Deploy | Secrets injected from the platform store into the process env; the App key is KMS-wrapped at rest, decrypted in-memory |
| BYOK set/rotate | KMS-wrap the new key; deactivate the old; the old ciphertext is retained for the audit window, then hard-deleted (retention) |
| Org deletion | The org's BYOK ciphertext is hard-purged with the org (retention cascade); KMS keys are marked for destruction after the retention window (a KMS *deletion*, not just a row delete) |
| Key compromise (suspected) | **Immediate rotation**: a new platform key + a forced BYOK re-key for affected orgs; the old key is KMS-disabled (not just re-keyed); an incident record + audit entry |
| A secret observed in a log (the redactor missed a new shape) | The redactor's pattern battery is the *response*: add the pattern, re-run the redaction suite; the observed secret is rotated (treat any log-observed secret as leaked) |

## 7. The invariants (the "must never" list, secret-specific)

1. A secret **never** appears in plaintext in a log, finding, prompt, queue payload, or browser response — enforced by the redaction gate + the test matrix above.
2. A platform secret **never** appears in a BYOK storage column (BYOK stores only the org's key, KMS-wrapped).
3. A tenant's BYOK key is **never** decrypted outside the worker process, and only in KMS scope for that org (cross-org KMS access is denied).
4. A secret in a code sample the PR added is treated as *untrusted data* — it's redacted before it reaches a provider, so it can't be echoed into a finding or exfiltrated via a provider.
5. A suspected leak is always answered with a **rotation**, not just a cleanup (cleanup can't undo a leak; rotation closes it).
