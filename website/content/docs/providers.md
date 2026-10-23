---
title: "Model providers & BYOK"
description: "Task-routed model selection across OpenAI, Anthropic, and Ollama; BYOK key encryption, and how the Enterprise plan shifts model spend to the customer's key."
date: 2026-10-23
status: published
tags: [providers, byok, models]
docsAuthor: "the VERCODE team"
frIds: [FR-311, FR-313, FR-314, FR-508]
group: configure
---

<!--
  U: a named doc author (the FR-311/313 block owner) is an open P2
  decision — "the VERCODE team" is the honest team label until it resolves.
-->

Model calls are task-routed: a task plus the org context resolve to a concrete provider and model. The routing table is config, not code, so a model swap is a config change (FR-311). OpenAI is the first provider; the Anthropic and Ollama adapters are Phase 1.

The default routes, per task:

| Task | Default tier | Why |
| --- | --- | --- |
| Risk triage | cheap model | A per-file "worth a deep review?" gate; high volume, low stakes |
| Deep review | strong model | Where the findings come from; a cheap model is the noise failure mode |
| Security review | strongest the tier allows | A miss is an incident; never downgraded for cost |
| Summary | cheap model | A narrative over validated findings; low stakes |

The plan's tier gates which models a task may resolve to: Free and Developer resolve within the standard tier; Team adds the strong tier; Enterprise resolves to any tier, including a frontier model.

## BYOK

An org admin stores a provider key at the org level (FR-313, the BYOK surface, FR-508's provider-settings screen). The key is encrypted with AES-256-GCM under a KMS-wrapped master key, masked in the dashboard, and revocable: a revoke hard-deletes the wrapped row immediately.

While a BYOK key is set, the model calls run on the org's key and the org's provider spend. The platform's default provider is used only when no key is set.

## Ollama and the Enterprise story

Ollama is the self-hosted-model adapter: a model on the org's infrastructure, with zero provider spend on VERCODE's side (the marginal cost is the org's compute, out of scope of VERCODE's accounting). On the Enterprise plan, BYOK and Ollama are the cost-shifting play: the account is near-zero COGS for VERCODE because the model spend is on the customer's bill. Frontier-model access and data residency are the compliance shapes on top of that.

## Fallback

On a provider failure — a 429, a 5xx, or a timeout after 2 bounded retries — the task falls back to its configured secondary provider, one switch, bounded (FR-314). A task whose primary is down and has no configured fallback still publishes its deterministic findings; the job is marked partial, not failed. The cost accounting records the actual model used, so an org sees the true cost even in fail-over.

Source: docs/TECHNICAL/MODEL_ROUTING.md (the routing table + the fallback, FR-314); docs/PRODUCT/PRD.md (FR-311, FR-313)

## Related

- [Security findings](/docs/security/) — why the security pass is never downgraded for cost
- [Pricing](/docs/pricing/) — the tier-gated model access per plan
