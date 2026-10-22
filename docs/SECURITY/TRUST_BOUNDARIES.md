# VERCODE — Trust Boundaries

A map of every trust boundary in the system, what crosses it, and how each crossing is controlled. This is the *spatial* view that `THREAT_MODEL.md` (the threat view) and `SECURITY_ARCHITECTURE.md` (the control view) reference.

## 1. The boundaries

```
┌────────────────────────────────────────────────────────────────────┐
│ EXTERNAL / UNTRUSTED                                               │
│  GitHub (App + webhooks) · AI providers · Billing provider        │
│  PR content (diffs, bodies, forks) · the browser (client JS)       │
└───────────────┬───────────────────────────────┬────────────────────┘
   [B1]         │                               │ [B4]
   GitHub webhooks (HMAC)                      provider API (TLS + key)
┌───────────────▼───────────────────────────────▼────────────────────┐
│ PLATFORM / TRUSTED CORE                                            │
│  api (verify+enqueue) · worker (pipeline) · Postgres · Redis       │
│        │ [B2] tenancy (org_id)      │ [B3] capability (RBAC)        │
└────────┼─────────────────────────────┼─────────────────────────────┘
         │                             │
┌────────▼─────────────────────────────▼─────────────────────────────┐
│ TENANT / org-scoped data                                           │
│  this org's reviews, findings, usage, config, audit                │
└────────────────────────────────────────────────────────────────────┘
        │ [B5] (Phase 2) sandbox boundary
┌───────▼────────────────────────────────────────────────────────────┐
│ ISOLATED ANALYSIS (Phase 2) — runs a PR's own tests                │
│  no creds · no prod DB · egress-deny · ephemeral fs · resource cap │
└────────────────────────────────────────────────────────────────────┘
```

## 2. Boundary contracts

### B1 — GitHub ingress (external → platform)
- **What crosses:** webhook events; the PR diff + bounded context *fetched* by the worker.
- **Controls:** HMAC + timestamp window + delivery dedup (reject forges/replays); the event is a *trigger*, re-derived state is authoritative (a forged-but-plausible body is inert — the signature is the gate, the reconciliation is the backstop).
- **What must NOT cross:** installation credentials to the browser; a whole repo to a provider; a client-trusted plan state.

### B2 — Tenancy (platform → tenant)
- **What crosses:** org-scoped data reads/writes.
- **Controls:** `org_id`-leading schema + repository scoping; cross-org → 404; org-namespaced cache keys; the worker re-reads tenancy from durable state.
- **Invariant:** no tenant row is reachable without its `org_id` binding.

### B3 — Capability (platform → tenant actions)
- **What crosses:** the *kinds* of actions a user may take (read vs mutate vs manage).
- **Controls:** the RBAC matrix, enforced at route + service; in-tenant denial → 403 (distinct from B2's 404).
- **Invariant:** the UI hides; the API enforces; a capability the API denies is never action-able from the UI regardless of what the UI shows.

### B4 — Provider egress (platform → external AI)
- **What crosses:** bounded context (changed files + 1-hop imports, token-capped) + the assembled prompt.
- **Controls:** the context budget (never the whole repo, NFR-29); the delimitation + no-tool review-mode boundary (injection defense); redaction of secrets *into* the prompt; BYOK KMS-wrapped, decrypted only in the worker.
- **What must NOT cross:** production credentials, a tenant's other-org data, a secret in plaintext, the whole repo.

### B5 — Sandbox (platform → isolated execution, Phase 2)
- **What crosses:** the PR's code + a minimal toolchain *in*; a pass/fail + failure log *out* (nothing else).
- **Controls:** isolation (gVisor/Firecracker/container-ns), resource caps, egress-deny, **no production credentials in the sandbox**, ephemeral filesystem, hard cleanup.
- **Invariant:** the sandbox process holds *nothing* sensitive; only a *result* crosses back. MVP: the boundary is designed but the capability is absent (ADR-008).

## 3. The "what must never cross" list (the invariants, consolidated)

1. **Secrets** never cross B4 (into a prompt) or any log line or finding.
2. **A tenant's data** never crosses B2 into another tenant.
3. **Repo source** never crosses B4 beyond the bounded context; it's never *stored* (ephemeral, NFR-28).
4. **Client plan/payment state** never crosses into authoritative decisions (B1/B4 analog: only a verified provider webhook moves plan state).
5. **A job payload's authz** never crosses into the worker's decisions (the payload is a pointer; durable state is authoritative).
6. **A PR's code** never executes in the trusted core (MVP: analysis only; Phase 2: only across B5).

## 4. Boundary verification

| Boundary | Primary test |
| --- | --- |
| B1 | `IT-webhook-forged` / `IT-webhook-replay` |
| B2 | `IT-tenant-01..05` / `ST-isolation-oracle` |
| B3 | `IT-authz-*` |
| B4 | `ST-context-bound` / `ST-injection-01..04` / `ST-secret-leak` |
| B5 | `ST-sandbox-*` (Phase 2) |

A *boundary violation* is the highest-severity class in the register — a test that proves a "never-cross" invariant holds is a **release gate**, not a regular test (it can't regress silently).
