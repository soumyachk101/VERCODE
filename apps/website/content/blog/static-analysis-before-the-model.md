---
title: "Static analysis before the model: why the pipeline is deterministic-first"
description: "Why the review pipeline runs static analysis before any model stage: the deterministic backstop, the benchmark gate, and the finding JSON the PR gets."
date: 2026-10-22
updated: 2026-10-22
author: the VERCODE team
tags: [pipeline]
status: published
ogImage: "/og.png"
---

<!-- author "the VERCODE team": a named human author is an unresolved item (UNRESOLVED_DECISIONS U-item); "the VERCODE team" is the honest placeholder, no fake individual name.
     ogImage "/og.png": per-slug OG image generation is a build task (WP1.x, the @vercel/og line); both posts point at the same shared /og.png for now. -->

## The claim

A deterministic backstop cuts false-positive noise more than a bigger model does. Most of the cost of a noisy AI reviewer is not in the model stage; it is in what the model is asked to do at all. A reviewer that only fires on things a static rule would have caught anyway is a reviewer a team learns to ignore — the failure mode named in the product vision, and the one this architecture targets before quality.

## The evidence: the gate, not the vibes

The review release gate in docs/TESTING/AI_EVALUATION.md is precise about the number that blocks a ship: a held-out precision regression of more than 5% between releases is a release-block, and the security-class recall floor is separate and hard (a > 3% regression there blocks regardless, because a missed security vulnerability is not a "known tradeoff"). The dataset behind that gate is a versioned held-out set with ground-truth finding sets — positive fixtures per defect class and negative fixtures that must not be flagged at all.

The reason that gate can work at all is the posture of the static stage, from docs/TECHNICAL/REVIEW_ENGINE_SPEC.md: deterministic findings from ESLint and Semgrep run first, carry no confidence floor ("rules, not guesses", the spec's own phrasing), and are authoritative for the classes they cover. The model then adds *delta* findings — logic, races, API-contract breaks, edge cases — on a bounded slice of the diff (60 files and 3,000 changed lines, the 1-hop import context), never the whole repository. A model constrained to what static analysis did not cover has a smaller hallucination surface, and the benchmark measures the shrinkage rather than assuming it.

## The decision record: ADR-005

The architectural decision is recorded as ADR-005 in docs/TECHNICAL/ARCHITECTURE_DECISIONS.md, "Deterministic-first review pipeline". Two lines from it:

- Context: "The dominant failure mode of AI review tools is noise that trains developers to ignore the bot."
- Decision: "Static analysis runs before/parallel to the LLM and its findings are authoritative for what they cover; the LLM adds delta findings that static tools can't reach. The two are merged, deduplicated, and gated by one policy engine."

The consequences the ADR records are the operational payoff. A provider outage still yields a useful, if partial, review: the static stage publishes on its own, so the review degrades instead of failing. Precision on the classes static tools are good at is *deterministic* — that is the property the benchmark gate asserts, not a hope. And the AI prompt is constrained to what static analysis did not cover, which is what shrinks the hallucination surface.

## What the finding looks like

Every published finding is a Zod-validated record — the shape in packages/contracts/src/findings.ts, the monorepo's single source of truth for finding, job, plan, and webhook shapes. A finding, as JSON:

```json
{
  "id": "fnd_a1b2c3",
  "file": "src/auth/session.ts",
  "line": 142,
  "severity": "high",
  "category": "security",
  "title": "Missing auth check on route handler",
  "description": "The handler reads the session cookie without verifying it belongs to the caller's org.",
  "suggestedFix": "Add the org-scoped session guard before the resource lookup.",
  "confidence": 0.97,
  "promptVersion": "v3"
}
```

The fields are the contract, and they are narrow on purpose. A category and a severity from a closed enum (not free text), a 1-based line in the new file, a model-reported confidence in [0,1] that the spec is explicit is a *heuristic*, not a calibrated probability, and a suggested fix when one exists. The model's output is re-validated against this schema on every call regardless of what the provider claims — and a finding whose line does not exist in the diff is dropped or demoted to a PR-body comment before the policy stage ever sees it.

## The floor that keeps the noise down

Policy stage [11] in the review engine spec applies the org's confidence floor — default 0.6 — plus per-repo category suppressions, and static findings are exempt from the floor because they are deterministic. The default is not a guess: the benchmark sweeps the floor from 0.4 to 0.9 and records the *actual* precision at each point, and the 0.6 default is the value that sits at the ~35% dismiss-rate target. The production signal closes the loop — a weekly job rolls a sample of dismissed findings back into the labeled set, so the benchmark grows with real orgs' data rather than staying a static snapshot.

## What this does not claim

Honesty about the limits is part of the argument. The confidence score is a model-reported heuristic, not a probability; the benchmark dataset is a snapshot, not a guarantee; a model or prompt swap is exactly what the 5% gate exists to catch. And a provider failure never fails the review — the static findings still publish, the job is marked `partial` rather than `failed`, and the summary names the stages that degraded. The deterministic stage is a backstop, not a guarantee; the gate is what keeps it honest.

### Related

- The confidence-floor and suppression rules, as the product ships them: [the rules docs](/docs/rules/)
- What the service does to source code, and what it does not: [the security docs](/docs/security/)

[Read the docs →](/docs/rules/)
