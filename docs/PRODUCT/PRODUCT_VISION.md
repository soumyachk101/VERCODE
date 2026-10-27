# VERCODE — Product Vision

## One-liner

VERCODE is an AI code-review SaaS that reads a GitHub pull request the way a careful senior engineer would, then posts an evidence-backed review — inline comments anchored to the diff, a summary verdict, and actionable fixes — inside a premium dashboard a team can actually live in.

## The problem

Modern AI review tools (CodeRabbit, Greptile, Qodo and the in-house scripts most teams cobble together) produce either:

- **Noise** — hundreds of low-signal style nits that train developers to stop reading the bot, or
- **Opaqueness** — "this line is risky" with no reasoning, no fix, no reproduction, so the human still has to do the actual review.

Both failure modes cost the same thing: developer trust. Once a team stops reading the bot, the bot is decoration.

## Positioning

VERCODE positions at the intersection of:

1. **Deterministic precision** — static analysis (ESLint, Semgrep, secret scanning) run before the LLM, so the findings the model adds are deltas on top of grounded, reproducible checks.
2. **Evidence-backed reasoning** — every finding carries a severity, a category, a confidence score, a short reason, and a suggested fix, all published as GitHub inline comments a maintainer can accept/reject/dismiss.
3. **Cost discipline** — tiered model routing (cheap model for boilerplate diffs, strong model for risky files), a platform token-spend cap as the abuse backstop, and explicit cost-per-review tracking that any team can see in plain form.
4. **A workspace, not just a bot** — the dashboard is a first-class product surface: review history, org-level analytics, custom rules, plain usage reporting, audit trail. The GitHub review is one output of a system the team owns.

## What we are not

- Not a generic AI chatbot over your codebase.
- Not a CI linter with an LLM pasted on.
- Not a "smart" diff viewer — the value is the *review*, not the *view*.

## Differentiators (original brand, not a clone)

- **VERCODE** identity (not a "CodeRabbit 2.0" reskin).
- **Review verdict + risk narrative** as a first-class artifact, not just a comment list.
- **Deterministic-first pipeline**: the AI never has to "discover" what Semgrep already proved.
- **Findings dedup + confidence floor** as server-enforced policy, not prompt suggestion.
- **Dashboard parity with GitHub**: PR review history, security findings rollup, org usage, and audit log live in VERCODE, not scattered across GitHub notifications.

## Long-horizon

VERCODE is the *system of record* for "what did the team decide about this change?" — every review is stored with its findings, every finding is linked to its source commit, and the dashboard is where a team answers the question "what's actually risky in our codebase?" over time, not just at merge time.

## Competitive frame

| Capability | CodeRabbit-class tools | VERCODE |
| --- | --- | --- |
| PR auto-review | ✓ | ✓ |
| Inline comments | ✓ | ✓ |
| Deterministic static analysis | partial (mostly LLM) | first-class (ESLint/Semgrep) |
| Evidence + suggested fix | varies | every finding carries both |
| Cost tracking per org | limited | per-review token + $ accounting |
| Team dashboard with review history | ✓ | ✓ |
| Custom rules | limited | org-level + repo-level rules, versioned |
| Model routing (cheap vs strong) | mostly fixed | task-routed with per-org config |
