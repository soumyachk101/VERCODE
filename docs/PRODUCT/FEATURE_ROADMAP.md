# VERCODE — Feature Roadmap

Phase 0 (MVP) is the foundation. Later phases build on it. Every phase lists its exit criteria so status is measurable.

## Phase 0 — Foundation (MVP, ~12–16 weeks)

**Exit:** end-to-end checklist in `MVP_SCOPE.md` passes with at least one real (or credentialed-mock) PR review published to GitHub, dashboard live on real data, security suite green.

Workstreams:
1. **Contracts + plans** — close the broken `plans.js` import; lock the shared schemas. *(week 1)*
2. **Auth + org + roles + tenancy** — sessions, invitations, RBAC, `org_id` scoping middleware. *(weeks 1–3)*
3. **Database + Prisma** — schema, migrations, indexes, tenant isolation. *(weeks 2–4)*
4. **GitHub App + webhooks** — install, repo discovery, PR events, signature validation, rate-limit handling. *(weeks 4–6)*
5. **Review pipeline** — diff parse, classify, static analysis (ESLint/Semgrep), AI orchestration, validation, dedup, policy, summary. *(weeks 5–9)*
6. **Publication** — inline comments + summary, validated anchoring, fallback, idempotency. *(weeks 9–10)*
7. **Queue + worker** — BullMQ, retry policy, dead-letter, observability. *(weeks 8–11)*
8. **Dashboard (all P0 pages)** — against real API, no fabricated data. *(weeks 10–14)*
9. **Usage + billing (stub) + audit** — quotas enforced, Stripe state, audit log. *(weeks 12–14)*
10. **Security suite + observability + Docker/CI** — *(weeks 13–16)*

## Phase 1 — Trust & Scale (post-MVP, ~8–12 weeks)

- **P1 auth:** SSO (OIDC), passkeys, org lifecycle (leave/delete + purge)
- **P1 AI:** BYOK key-management UX, multi-provider (Anthropic/Ollama), provider fallback polish, content-hash short-circuit for identical force-pushes
- **P1 repo intelligence:** test-file discovery + missing-coverage hints
- **P1 commercial:** live Stripe payment capture, invoices, usage export
- **Scale-out:** Postgres read replica for dashboard, Redis-based dashboard caching, connection pooling
- **Exit:** SSO live on one org, BYOK on one org, content-hash dedup cuts review cost on re-pushes by ≥ 40%, zero cross-tenant regressions.

## Phase 2 — Depth (~12–16 weeks)

- **Untrusted code execution** in an isolated sandbox boundary (gVisor/Firecracker or container-isolated runner): *run the PR's own tests* and report failures as findings. Hard requirement: no production credentials, network-egress deny-by-default, CPU/mem/time limits, ephemeral filesystem.
- **pgvector semantic retrieval** for large monorepos; incremental re-index on merge
- **Multi-platform:** GitLab (first), Bitbucket (second) adapters behind the same review engine
- **IDE extension** (VS Code) — read VERCODE findings in-editor, one-click re-review
- **Exit:** sandboxed test-execution available on Team+ plans; ≥ 1 GitLab org live; IDE extension beta.

## Phase 3 — Enterprise & Product Depth (ongoing)

- **Enterprise SSO + SCIM**, audit export (SIEM), data-residency regions
- **Custom rules engine v2:** user-authored lint-as-prompt rules with test cases
- **Review QA flywheel:** org "dismissed" findings feed a per-org preference model (privacy-scoped)
- **Cost analytics + budget alerts** → automated plan-upgrade recommendations
- **Exit:** ≥ 3 enterprise logos, SCIM live, zero PII in logs audited clean.

## Cross-cutting (every phase)

- Security test plan green on every release candidate (`SECURITY/SECURITY_TEST_PLAN.md`)
- Tenant-isolation suite re-run on every schema change
- AI benchmark regression gate (`TESTING/BENCHMARK_DATASET.md`): precision on the held-out set must not drop > 5% between releases or the release is blocked
- Docs stay in sync with code (`DOCUMENTATION_REVIEW.md` re-validated per release)
