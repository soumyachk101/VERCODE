# VERCODE — User Personas

## Persona 1 — The Individual Developer

**Name (anonymized): "Priya"** · Backend engineer at a 40-person SaaS.

- Writes 2–5 PRs a week, ~50–300 lines each, mostly TypeScript/Python.
- Pain: PRs sit in review for 6–24 h; when they come back, feedback is either "LGTM" or a wall of style nits that aren't the actual issues.
- Verdict on AI review tools: "tried three, all too noisy, muted the bot in two of them."
- What VERCODE must do: catch the real bug in < 3 minutes, keep the noise low, explain *why* (not just *what*), and never post a finding pointing at a line that doesn't exist in the diff.
- Success for Priya: she reads the summary verdict first, opens the one "high" finding, sees the suggested fix, applies it, and the PR merges.

## Persona 2 — The Tech Lead

**Name (anonymized): "Marcus"** · Tech lead, ~30 eng staff, two squads.

- Responsible for review quality across the org; reviews ~5 PRs/day himself.
- Pain: no visibility into *what* the team is breaking repeatedly (race conditions in the queue worker, N+1s in the reports service); security findings arrive in Slack, not in a queryable place.
- What VERCODE must do: org-level security rollup, finding trends by category/repo, the ability to suppress noisy categories per-repo without touching the whole org, and a record of every review for post-mortems.
- Success for Marcus: opens the dashboard, sees "4 new high-severity security findings this week in payments-service", drills into the PRs, forwards the worst one to the owner.

## Persona 3 — The Engineering / Platform Manager

**Name (anonymized): "Dana"** · VP Eng, 200+ devs across 4 teams.

- Cares about cost, throughput, and whether the AI tool is earning its seat.
- Pain: AI spend is a black box; can't answer "what does each review cost" or "which team's PRs are the highest risk."
- What VERCODE must do: per-review cost accounting, org usage vs plan quotas, review-coverage (% of merged PRs reviewed), cost/review trend.
- Success for Dana: monthly report, one page, answers "are we getting value for the plan we're on?" in < 5 minutes.

## Persona 4 — The DevSecOps / Platform Engineer

**Name (anonymized): "Rahul"** · Platform engineer, owns CI/CD and security tooling.

- Integrates VERCODE into the org: GitHub App, webhook endpoints, model configuration.
- Pain: vendor tools that leak secrets into logs, break on webhook replay, or run untrusted code in a shared process.
- What VERCODE must do: verifiable webhook signature flow, least-privilege App permissions, prompt-injection defenses documented and tested, encrypted BYOK, audit trail, no execution of repo code in the API process.
- Success for Rahul: passes the security test plan (`SECURITY/SECURITY_TEST_PLAN.md`) and the threat model is something he can defend to his CISO.

## Persona 5 — The Org Owner / Admin

**Name (anonymized): "Aisha"** · CTO, 15-person startup, founder-led.

- Needs to keep cost predictable while scaling the team.
- Pain: surprise AI bills; no way to set a hard cap.
- What VERCODE must do: plan-based hard caps with graceful behavior (skip review + post notice on the PR, not fail silently), upgrade/downgrade path, cancellation with data export.
- Success for Aisha: sets a monthly cap, gets warned at 80%, and the cap holds even under a bad week of large PRs.

## Persona notes

- All personas see the **same dashboard** but different emphasis: Priya lives in *review detail*, Marcus in *security rollup + trends*, Dana in *cost/usage*, Rahul in *config + audit*, Aisha in *billing/quotas*.
- The dashboard information architecture (`DESIGN/INFORMATION_ARCHITECTURE.md`) maps these five paths.
