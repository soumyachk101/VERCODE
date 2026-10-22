# VERCODE — Architecture Decision Records (ADR)

Format: context → decision → consequences. Decisions are recorded so the *why* survives.

---

### ADR-001 — Modular monolith + async worker, not microservices

**Context.** The brief explicitly defers distributed services until demonstrated need. The review pipeline is the only genuinely async, resource-heavy concern.

**Decision.** A single repo with three deployables (`web`, `api`, `worker`) and a set of shared library packages. No service-to-service RPC in MVP; the only async hand-off is `api` → BullMQ → `worker`.

**Consequences.** Simpler ops, one migration system, trivially-verified tenant isolation. The cost: `worker` and `api` share the Postgres schema — mitigated by the contracts package pinning shapes. Revisit if the worker's resource profile (large static-analysis sandboxes) makes `api` autoscaling unpredictable.

---

### ADR-002 — Fastify for the dedicated API service

**Context.** The web app is Next.js, but a *dedicated* backend is justified (webhook ingress, queue, billing webhooks, GitHub App auth are not frontend concerns). The brief allows a dedicated backend.

**Decision.** Fastify + TypeScript. JSON-native, schema-based validation that pairs with the shared Zod contracts, first-class hooks for auth/tenant/rate-limit/audit, and a small dependency surface.

**Consequences.** Two TypeScript codebases share `packages/contracts`; a contract change is a two-way break that CI enforces. Fastify's hook model fits the "verify-then-tenant-then-rate-limit-then-handle" middleware chain cleanly.

---

### ADR-003 — Prisma + PostgreSQL

**Context.** Multi-tenant relational data (orgs, members, reviews, findings, usage, audit) with strong migration needs.

**Decision.** Prisma ORM + Postgres 16. Prisma's migration tooling and type-safe client justify it over raw SQL; Postgres over MySQL for JSONB (findings payload), composite-index tenancy, and PITR.

**Consequences.** Every repository method is written to take `orgId` first (enforced by a lint rule + code review gate). Prisma's `@@index` lets us encode the tenant-isolation index strategy declaratively (`DATABASE/INDEXING_STRATEGY.md`).

---

### ADR-004 — BullMQ over in-process task runners

**Context.** NFR-12/13/14 require durability, bounded retries, DLQ, and independent scaling of the pipeline.

**Decision.** Redis + BullMQ. One queue per concern (`review-queue`, `retention-queue`, `billing-queue`); per-queue concurrency, backoff, and DLQ.

**Consequences.** Redis becomes a hard dependency (sessions too — single cache/queue/session store). Job payloads carry only a `jobId`; the worker re-reads durable state (never trusts the payload for authz), which makes redelivery safe.

---

### ADR-005 — Deterministic-first review pipeline

**Context.** The dominant failure mode of AI review tools is *noise* (a) that train developers to ignore the bot (PRODUCT_VISION.md).

**Decision.** Static analysis (ESLint + Semgrep) runs before/parallel to the LLM and its findings are authoritative for what they cover; the LLM adds *delta* findings (logic, race, contract, edge-case) that static tools can't reach. The two are merged, deduplicated, and gated by one policy engine.

**Consequences.** A provider outage still yields a useful (if partial) review. Precision on the classes static tools are good at is *deterministic*, which is what the benchmark gate (`TESTING/BENCHMARK_DATASET.md`) asserts. The AI prompt is constrained to what static analysis did *not* cover, which shrinks the hallucination surface.

---

### ADR-006 — Provider-abstracted AI with structured output

**Context.** No single model is correct for every task; cost/quality varies; the owner wants BYOK and multi-provider.

**Decision.** An `AIProvider` interface with `completeStructured()` (JSON-schema-constrained) and a task→model routing table in `packages/config`. OpenAI is default; Anthropic + Ollama are adapters. The engine re-validates *all* AI output with Zod regardless of provider compliance claims.

**Consequences.** Confusing "confidence" is treated as a model-reported heuristic, not a calibrated probability (per brief); the policy floor operates on it but is configurable and per-org. Prompt versioning + per-call cost capture make routing decisions auditable.

---

### ADR-007 — Commit-SHA idempotency, not content-hash (MVP)

**Context.** Re-pushes with identical diffs (rebase, commit reword) waste review cost if keyed on content.

**Decision (MVP).** Idempotency key = `(org, repo, prNumber, commitSha)`. A re-review on the *same* SHA is a no-op; a *new* SHA triggers a fresh job (content-hash short-circuit is explicitly P1 — it's a cost optimization, not a correctness requirement).

**Consequences.** Simpler and correct for the common case. The P1 content-hash layer will store a blake3 of the diff and skip the AI stage when unchanged, cutting cost on re-pushes.

---

### ADR-008 — No untrusted code execution in MVP

**Context.** Running a PR's own tests is high-value but is the *most dangerous* capability in the brief (arbitrary code execution).

**Decision.** MVP does static analysis only. The sandbox boundary is *designed* now (`SECURITY/SANDBOX_SECURITY.md`) and *built* in Phase 2. Until then, no path in `worker` executes repo-provided code.

**Consequences.** We cannot yet "run the tests and report failures" — a documented product limitation (`IMPLEMENTATION/KNOWN_LIMITATIONS.md`). The design work up front means Phase 2 is an additive process, not a redesign.

---

### ADR-009 — Stripe as the billing provider, with a Rajatko/Razorpay evaluation for INR

**Context.** The brief names the Indian market explicitly. Stripe does *not* support INR-issued cards for Indian businesses directly (Stripe supports INR *pricing* and international cards, but not UPI/Indian domestic card acquiring as a native provider for India-incorporated entities).

**Decision (MVP).** Stripe for the billing *state machine and provider-webhook pattern* (mature, test-friendly, global card acceptance). An adapter boundary (`packages/billing`) is provider-agnostic: a Rajatko/Razorpay adapter is a drop-in. The provider is chosen at deploy time via config; **the default dev/default provider is Stripe**, and INR-market production deployment should use the Razorpay adapter.

**Consequences.** Eligibility: Stripe requires a supported business entity; India-incorporated companies must verify Stripe's current India status (docs + sales confirmation) before relying on it for INR. Razorpay/Rajatko is the documented fallback for domestic INR + UPI. *This is a documented deviation to verify with the actual provider at integration time; the architecture does not depend on the choice.*

---

### ADR-010 — UI sourced from the installed design skills, not generic SaaS defaults

**Context.** Owner instruction: use `design-taste-frontend` and `emil-design-eng` for the UI build; avoid "generic AI dashboard aesthetics, excessive gradients, decorative empty space."

**Decision.** The design system (`DESIGN/DESIGN_SYSTEM.md`) is derived from the `design-taste-frontend` reference corpus (palettes, type, layout, critique, tells) and its *library JSON* (concrete tokens). Motion/interaction follow `emil-design-eng`: ≤300 ms UI motion, custom `cubic-bezier` ease-out curves, `transform`/`opacity`-only animation, `:active` scale(0.97), `@starting-style` entries, `prefers-reduced-motion` collapse, stagger ≤80 ms. A "generic dashboard" anti-pattern check (from `break-ui` + the critique reference) gates the design review.

**Consequences.** `DESIGN/PAGE_SPECIFICATIONS.md` and `COMPONENT_CATALOG.md` are the review checklist; the design-taste `lint.mjs` script is run against the built UI in CI (where it applies) to catch the "tells" the skill calls out.

---

### ADR-011 — Preserve the auto-sync daemon and skill infrastructure

**Context.** `scripts/auto_sync.sh` + `run_loop.sh` + `.agents/**` + `skills-lock.json` are the owner's existing infrastructure. The owner explicitly forbade deleting existing files.

**Decision.** None of these are modified. All implementation work is committed to `main` in small logical units so the auto-sync (which PRs+merges dirty trees) picks up coherent state. New code lives under `apps/`, `packages/`, `infra/`, `tests/`, `docs/` — no collision with the sync scripts.

**Consequences.** In-flight work can be auto-merged within ~1 minute if it sits in the tree; commit discipline is a *requirement* of this repo, not a preference.
