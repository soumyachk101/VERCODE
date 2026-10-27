# VERCODE — Docs Index

One line per subfolder, with links into each folder's key files.

- **[API/](API/)** — the public HTTP + webhook contract: [`API_SPECIFICATION.md`](API/API_SPECIFICATION.md), [`OPENAPI.yaml`](API/OPENAPI.yaml), [`AUTHENTICATION.md`](API/AUTHENTICATION.md), [`WEBHOOK_SPECIFICATION.md`](API/WEBHOOK_SPECIFICATION.md).
- **[BUSINESS/](BUSINESS/)** — launch + positioning: [`SAAS_LAUNCH_PLAN.md`](BUSINESS/SAAS_LAUNCH_PLAN.md) (the launch source of truth — see the 2026-10 note below).
- **[DATABASE/](DATABASE/)** — the data model: [`DATABASE_DESIGN.md`](DATABASE/DATABASE_DESIGN.md), [`SCHEMA_REFERENCE.md`](DATABASE/SCHEMA_REFERENCE.md), [`TENANT_ISOLATION.md`](DATABASE/TENANT_ISOLATION.md), [`DATA_RETENTION.md`](DATABASE/DATA_RETENTION.md).
- **[DESIGN/](DESIGN/)** — the dashboard's visual + page system: [`DESIGN_SYSTEM.md`](DESIGN/DESIGN_SYSTEM.md), [`INFORMATION_ARCHITECTURE.md`](DESIGN/INFORMATION_ARCHITECTURE.md), [`PAGE_SPECIFICATIONS.md`](DESIGN/PAGE_SPECIFICATIONS.md), [`ACCESSIBILITY.md`](DESIGN/ACCESSIBILITY.md).
- **[IMPLEMENTATION/](IMPLEMENTATION/)** — the build plan: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION/IMPLEMENTATION_PLAN.md), [`TASK_BREAKDOWN.md`](IMPLEMENTATION/TASK_BREAKDOWN.md), [`DEFINITION_OF_DONE.md`](IMPLEMENTATION/DEFINITION_OF_DONE.md), [`TRACEABILITY_MATRIX.md`](IMPLEMENTATION/TRACEABILITY_MATRIX.md).
- **[OPERATIONS/](OPERATIONS/)** — run + release: [`DEPLOYMENT.md`](OPERATIONS/DEPLOYMENT.md), [`CI_CD.md`](OPERATIONS/CI_CD.md), [`OBSERVABILITY.md`](OPERATIONS/OBSERVABILITY.md), [`DISASTER_RECOVERY.md`](OPERATIONS/DISASTER_RECOVERY.md).
- **[PRODUCT/](PRODUCT/)** — what + why: [`PRD.md`](PRODUCT/PRD.md), [`FUNCTIONAL_REQUIREMENTS.md`](PRODUCT/FUNCTIONAL_REQUIREMENTS.md), [`ACCEPTANCE_CRITERIA.md`](PRODUCT/ACCEPTANCE_CRITERIA.md), [`USER_JOURNEYS.md`](PRODUCT/USER_JOURNEYS.md).
- **[SECURITY/](SECURITY/)** — the threat model + controls: [`SECURITY_ARCHITECTURE.md`](SECURITY/SECURITY_ARCHITECTURE.md), [`THREAT_MODEL.md`](SECURITY/THREAT_MODEL.md), [`SANDBOX_SECURITY.md`](SECURITY/SANDBOX_SECURITY.md), [`PRIVACY.md`](SECURITY/PRIVACY.md), [`SECURITY_TEST_PLAN.md`](SECURITY/SECURITY_TEST_PLAN.md).
- **[TECHNICAL/](TECHNICAL/)** — the system design: [`ARCHITECTURE_DECISIONS.md`](TECHNICAL/ARCHITECTURE_DECISIONS.md), [`INTEGRATION_DESIGN.md`](TECHNICAL/INTEGRATION_DESIGN.md), [`AI_SYSTEM_DESIGN.md`](TECHNICAL/AI_SYSTEM_DESIGN.md), [`REVIEW_ENGINE_SPEC.md`](TECHNICAL/REVIEW_ENGINE_SPEC.md), [`GITHUB_APP_SETUP.md`](TECHNICAL/GITHUB_APP_SETUP.md).
- **[TESTING/](TESTING/)** — the test strategy: [`TEST_STRATEGY.md`](TESTING/TEST_STRATEGY.md), [`E2E_TEST_PLAN.md`](TESTING/E2E_TEST_PLAN.md), [`RELEASE_CRITERIA.md`](TESTING/RELEASE_CRITERIA.md).
- **[WEBSITE/](WEBSITE/)** — the marketing site spec (the site itself lives at `website/` at the repo root, not `apps/website/`): [`PRD.md`](WEBSITE/PRD.md), [`INFORMATION_ARCHITECTURE_AND_PAGES.md`](WEBSITE/INFORMATION_ARCHITECTURE_AND_PAGES.md), [`CONTENT_SCHEMAS.md`](WEBSITE/CONTENT_SCHEMAS.md), [`DEPLOYMENT_AND_TESTING.md`](WEBSITE/DEPLOYMENT_AND_TESTING.md), [`ROADMAP_AND_ACCEPTANCE_CRITERIA.md`](WEBSITE/ROADMAP_AND_ACCEPTANCE_CRITERIA.md).
- **[diagram-prompts/](diagram-prompts/)** — the SVG-source prompts for each diagram: [`architecture.md`](diagram-prompts/architecture.md), [`pipeline.md`](diagram-prompts/pipeline.md), [`data-flow.md`](diagram-prompts/data-flow.md), [`repository.md`](diagram-prompts/repository.md), [`trust-model.md`](diagram-prompts/trust-model.md).
- **[diagrams/](diagrams/)** — the rendered repo/data-flow diagrams: [`repository.svg`](diagrams/repository.svg), [`data-flow.svg`](diagrams/data-flow.svg).
- **[assets/](assets/)** — rendered diagram + screenshot artifacts (the `architecture`/`pipeline`/`trust-model` PNG+SVG pairs, the `screenshots/` app-view set, plus the embedded figures below).

## Diagrams

![](assets/post-submit-loop.jpeg)
*The VERCODE review loop: pre-submit (threat models + in-depth scan & validation), findings triage + vulnerability report, agentic fix proposal, human review & edits, then merge — with the post-submit findings flowing back into check-in aggregation.*

## 2026-10 note — no-paywall direction

The pricing/plan/quota system was removed product-wide in 2026-10 (the launch ships **without paid tiers**: usage is a plain informational report, GitHub connect is the onboarding flow). The three deleted BUSINESS docs — `BILLING_SPECIFICATION.md`, `PRICING_STRATEGY.md`, `USAGE_QUOTAS.md` — are gone with it; **[`SAAS_LAUNCH_PLAN.md`](BUSINESS/SAAS_LAUNCH_PLAN.md) is the launch source of truth**. All pricing/plan/quota language in the WEBSITE docs now refers to the usage + GitHub-connect surface instead.
