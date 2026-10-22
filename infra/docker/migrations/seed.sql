-- The dev-stack seed (a the `smoke` target's tenant bootstrap, DEPLOYMENT §2).
--
-- The api's webhook route resolves the PR event's `installation.id` against
-- a *known* org + install + repo (WEBHOOK_SPECIFICATION §1.2 "an unknown
-- install → 404 + audit"). A from-scratch dev-stack has no rows yet — the
-- smoke target seeds a single demo org + install + repo so one mock PR can
-- be driven end-to-end without hand-crafting the API's auth + org +
-- connect flow.
--
-- The slug is `smoke-demo` (a stable id so a re-run against an existing DB
-- finds the same row, not a 404). The accountLogin is set to the slug so
-- a future `installation` created webhook (a the normal seeding path)
-- resolves to the same org.
--
-- A this seed is a dev-stack convenience, not a prod path — a prod deploy
-- seeds the real org via the dashboard's onboarding (a the J1 journey,
-- E2E_TEST_PLAN §2 `onboarding.spec.ts`).

-- A the org.
INSERT INTO organizations (id, slug, name, plan, status, created_at)
VALUES ('smoke-demo-org', 'smoke-demo', 'Smoke Demo Org', 'FREE', 'ACTIVE', now())
ON CONFLICT (slug) DO NOTHING;

-- A the github install (a the `accountLogin` matches the org slug so a
-- real `installation.created` event would upsert onto the same row).
INSERT INTO github_installs (id, org_id, github_installation_id, account_type, account_login, status, created_at)
VALUES ('smoke-demo-install', 'smoke-demo-org', '1', 'Organization', 'smoke-demo', 'ACTIVE', now())
ON CONFLICT (org_id, github_installation_id) DO NOTHING;

-- A the github repo row (a the `githubRepoId` is the mock-github's canned
-- 424242 — the webhook's `repository.id` must match it).
INSERT INTO github_repos (id, org_id, install_id, github_repo_id, full_name, default_branch, connected, created_at)
VALUES (
  'smoke-demo-repo', 'smoke-demo-org', 'smoke-demo-install',
  424242, 'vercode/mock-pr', 'main', true, now()
)
ON CONFLICT (org_id, github_repo_id) DO NOTHING;
