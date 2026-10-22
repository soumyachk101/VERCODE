# VERCODE — Model Routing

The routing layer maps a *task* + *org context* → a *concrete provider + model*. It is the mechanism that makes per-review cost controllable (cheap model for routine work, strong model where it's justified).

## 1. The routing table (`packages/config`)

```ts
// config/routing.ts — the single source of truth; no module hardcodes a model
export interface ModelRoute {
  task: "risk-triage" | "deep-review" | "security-review" | "summary";
  provider: string;       // "openai" | "anthropic" | "ollama" | "mock"
  model: string;          // concrete model id
  maxTokens: number;
  timeoutMs: number;
  minPlanTier?: Plan;     // a task can be gated to a plan tier
}

export const DEFAULT_ROUTES: ModelRoute[] = [
  { task: "risk-triage",    provider: "openai",  model: "gpt-4o-mini",   maxTokens: 1024,  timeoutMs: 15_000 },
  { task: "deep-review",    provider: "openai",  model: "gpt-4o",        maxTokens: 4096,  timeoutMs: 60_000 },
  { task: "security-review", provider: "openai",  model: "gpt-4o",        maxTokens: 4096,  timeoutMs: 60_000 },
  { task: "summary",        provider: "openai",  model: "gpt-4o-mini",   maxTokens: 2048,  timeoutMs: 20_000 },
];

// Org overrides (org-level config, admin-set): a specific task can be pinned
// to a different model (e.g., a cost-conscious org pins deep-review to a
// cheaper model; a security-focused org pins security-review to the strongest).
```

**Model names above are the *current defaults* and are intentionally in config, not code.** When a model is deprecated or a better-cost/quality model ships, the routing table is the *only* thing that changes. (The exact model ids are a deploy-time decision; the contract is the *shape*, not the id.)

## 2. Task → routing decisions (when a cheaper or stronger model is justified)

| Task | Default | Why this tier | Upgrade/downgrade rule |
| --- | --- | --- | --- |
| `risk-triage` | cheap | A per-file "worth deep review?" call is high-volume, low-stakes; the cheap model's job is to *gate*, and it gates on coarse signal. | Downgrade only if the cheap model's gate precision (measured on the benchmark) drops below the floor. |
| `deep-review` | strong | This is where real findings come from; a cheap model here is the CodeRabbit-noise failure mode. | An org on a cost-sensitive plan may pin it to a mid-tier model; the benchmark gate must still hold for *that org's* review class. |
| `security-review` | strong (top tier) | Security findings carry the highest downstream cost (a miss is an incident). Always the strongest available to the org's tier; Enterprise may pin a frontier model. | Never downgrade security-review for cost. |
| `summary` | cheap | A narrative over *already-validated* findings; low stakes. | — |

**The evidence-based rule (from the brief):** "Use cheaper models for routine reviews and stronger models for complex cases *when evaluation justifies the choice*." The benchmark dataset (`TESTING/BENCHMARK_DATASET.md`) provides that justification: for each plan tier, we measure precision/recall/cost at each model choice and pin the routing table to the choice that maximizes the *actioned-finding* metric under the plan's cost ceiling (SUCCESS_METRICS).

## 3. Org-level routing config (admin surface, FR-508)

An org admin can:
- **Pin a task to a specific model** (within the org's plan tier's allowed set). The pin is validated against the tier's `minPlanTier` gate — a Free org cannot pin `security-review` to an Enterprise-only model.
- **Set the provider** (when multi-provider is enabled, Phase 1): OpenAI / Anthropic / Ollama.
- **BYOK** (P1): supply their own API key for the chosen provider; the platform default is used otherwise.

A routing change is versioned (it's a config row with a version + timestamp, audit-logged). It does *not* invalidate in-flight reviews; it applies to the next review.

## 4. Model tier access by plan

| Plan | risk-triage | deep-review | security-review | summary |
| --- | --- | --- | --- | --- |
| Free | standard | standard (capped files/review) | standard (security-only on security-sensitive files, capped) | standard |
| Developer | standard | standard | standard | standard |
| Team | standard | standard+strong | strong | standard |
| Enterprise | any | any (frontier) | any (frontier) | any |

`standard` / `strong` are *tiers*, not model names; the routing table resolves tier→concrete model. This decouples the plan contract from the model market (a model swap is a config change, not a plan change).

## 5. Fallback and fail-over (FR-314)

```
task → primary route (provider A, model M)
  on 429/5xx/timeout after 2 bounded retries:
    → fallback route (provider B, model M')   [one switch, configured per task]
  on fallback failure:
    → the AI stage for that task fails; deterministic findings still publish; job = partial
```

- Fallback is **one switch, bounded** — not an infinite fail-over loop.
- A task whose primary is down falls back *only if the task has a configured fallback* (security-review always does; summary may not, in which case a deterministic summary is produced from counts).
- The fallback *costs more or less* than the primary; the cost accounting reflects the *actual* model used (AC-306), so an org sees the true cost even in fail-over.

## 6. Cost model inputs

- Per-task `maxTokens` + provider rate table (`config/rates.ts`: `{ model: { inputPer1M, outputPer1M } }`).
- `estUsdCost(task) = (inputTokens/1e6)*inputPer1M + (outputTokens/1e6)*outputPer1M`.
- A review's total cost = sum over its tasks. Ollama (self-hosted) → `estUsdCost = 0` (the org's compute cost is out of scope of VERCODE's accounting).
- The **cost/review** metric (SUCCESS_METRICS) is computed from this; the plan's cost ceiling is enforced by the quota gate (AC-401) using the *token-spend* cap, which is derived from the plan's USD ceiling via the rate table.

## 7. Routing invariants (what a code review gate checks)

1. **No module outside `config` names a concrete model** — grep for model ids must return hits *only* in `packages/config`. (A lint rule + review gate.)
2. **Every task has exactly one resolved route** for a given org+plan; ambiguity is a config error, not a runtime guess.
3. **Security-review is never downgraded for cost** — the routing gate rejects an org override that would lower security-review below its tier floor.
4. **Every call records its route + version** — so a routing regression is traceable to a config change (audit).
