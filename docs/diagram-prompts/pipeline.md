# VERCODE Review Pipeline Diagram — Prompt

> **Output format:** PNG (rendered from SVG source; keep the SVG on disk as the
> source of truth, export at 2× scale for crispness). Save to
> `docs/assets/pipeline.png`. The SVG stays at `docs/assets/pipeline.svg`.
> **Canvas:** 1400 × 620. PNG export: 2800 × 1240 px.
> **Structure:** 6 vertical swimlanes, left → right, each 202 px wide, 380 px tall, starting at y = 78.
> **Bottom strip:** 4 guardrail cards (G-1 … G-4), each ~320 px wide, y = 478.

---

## Swimlane 1 — INGRESS & VERIFY (red top strip)

**Node title:** GitHub Webhook
**Badge:** `HMAC-SHA256` (red)

Bullets:
- Route: `POST /webhooks`
- 5-minute timestamp window
- 24h delivery-id dedup
- Signature verification layer
- Body schema validation

**Yellow callout box (inside lane):**
- `< 300ms SLA`
- Returns `202 Accepted`

**Grey invariant box (bottom of lane):**
- Title: `INGRESS INVARIANT`
- Zero LLM calls on ingress
- Zero diff fetches on ingress
- T-10 DoS vector closed
- Async worker handoff

---

## Swimlane 2 — DISPATCH & GATES (orange top strip)

**Node title:** BullMQ review-queue
**Badge:** `DURABLE QUEUE` (orange)

Bullets:
- Payload: `{ jobId }` pointer only
- Re-reads durable state from Postgres
- In-flight lock (`SET NX`)
- Concurrency: 4 per worker

**Orange callout box:** `PRE-FLIGHT GATES`
- Same-SHA check (ADR-007)
- Monthly plan quota check
- Over-cap: skip with notice (never silent)

**Grey box:** `QUOTA GUARANTEE`
- If quota exceeded: ZERO AI tokens consumed
- Post notice on PR; never silent skip

---

## Swimlane 3 — CONTEXT RETRIEVAL (blue top strip)

**Node title:** Bounded Diff & AST
**Badge:** `CONTEXT BOUND` (blue)

Bullets:
- GitHub App token auth
- Fetches PR unified diff
- Parsed via `diff-engine`
- Bounded 1-hop AST import graph
- Diff cached in Redis (24 h)

**Blue callout box:** `STRICT BUDGET CAP`
- Max 60 changed files
- Max 3,000 diff lines

**Grey box:** `SECURITY BOUNDARY`
- Repo code is treated as DATA, never as control instructions
- Prompt injection contained at this stage

---

## Swimlane 4 — DUAL ANALYSIS (green top strip)

This lane has **two parallel sub-boxes** (Branch A on top, Branch B below, both connect to and from Swimlane 3 and 5).

**Branch A (green box) — Deterministic AST**
- Badge: `ESLINT + SEMGREP`
- Fast AST syntax & rule pass
- Zero LLM tokens consumed
- Authoritative; no confidence floor
- Reproducible rule findings

**Branch B (purple box) — Task-Routed AI Pass**
- Badge: `GPT-4o / CLAUDE 3.5`
- Pass 1: Diff risk triage
- Pass 2: Deep review on high-risk files
- Pass 3: Dedicated security pass on security-sensitive files
- Strict Zod schema validation
- Confidence score output
- (Inner sub-box: `PARALLEL EXECUTION` — both branches run concurrently)

---

## Swimlane 5 — POLICY & DEDUP (purple top strip)

**Node title:** Merge & Validate
**Badge:** `POLICY ENGINE` (purple)

Bullets:
- Line anchor verification
- Demote unanchored findings to PR body comment
- 3-tuple deduplication: **(file, line, category)** (bold, indigo)
- Static findings take priority

**Purple callout box:** `CONFIDENCE FILTER`
- Default floor: 0.6 confidence
- Per-repo suppression rules

**Grey box:** `VERDICT SYNTHESIS`
- Rollup by severity
- Category risk distribution
- Final markdown summary generated

---

## Swimlane 6 — PERSIST & PUBLISH (teal top strip)

**Node title:** GitHub & Database
**Badge:** `PERSIST-THEN-PUBLISH` (teal)

Three stacked sub-boxes:

| Sub-box | Title | Bullets |
| --- | --- | --- |
| 1 (teal bg) | PostgreSQL Write | • Insert `review_findings` / • Update `review_job` status / • Append `audit_events` record |
| 2 (green bg) | GitHub Publication | • Octokit PR review call / • Validated inline comments / • Formatted verdict body / • Fallback to body comment on anchor failure |
| 3 (grey bg) | Attribution & Cost | • Token spend calculation / • Deduct from monthly quota / • Emit OpenTelemetry metric |

---

## Connectors between lanes (horizontal, 2 px, with small label chips)

| From → To | Label chip | Color |
| --- | --- | --- |
| Lane 1 → Lane 2 | `Q` | orange |
| Lane 2 → Lane 3 | `OK` | blue |
| Lane 3 → Lane 4 (top, Branch A) | *(no chip)* | green |
| Lane 3 → Lane 4 (bottom, Branch B) | *(no chip)* | purple |
| Lane 4 (top, Branch A) → Lane 5 | *(no chip)* | green |
| Lane 4 (bottom, Branch B) → Lane 5 | *(no chip)* | purple |
| Lane 5 → Lane 6 | `TX` | teal |

Branches in Lane 4 **split** from Lane 3 (two diverging arrows) and **join** into Lane 5 (two converging arrows). Use orthogonal L-shaped paths for the split/join.

---

## Bottom guardrail cards (y = 478, height = 114, 4 cards left→right)

| Card | Title | Badge | Bullets |
| --- | --- | --- | --- |
| G-1 (red strip) | Constant-Latency Webhook Ingress | `< 300 MS 202 ACCEPTED` | • Verify HMAC-SHA256 & timestamp window / • Check 24h delivery-id deduplication / • No diff fetch or LLM calls on ingress path (T-10) |
| G-2 (blue strip) | Bounded Context Window | `60 FILES / 3K LINES CAP` | • Changed files + bounded 1-hop imports / • Over-budget diffs truncated gracefully / • Repository content is input data, never authority |
| G-3 (green strip) | Deterministic Grounding First | `STATIC CHECKS CANNOT OVERRIDE` | • ESLint + Semgrep AST findings are authoritative / • LLM findings are deltas on top of grounded rules / • Model output validated against Zod schemas |
| G-4 (teal strip) | Persist-then-Publish | `ZERO LOST FINDINGS` | • Durable PostgreSQL write before GitHub API call / • GitHub rate-limit triggers exponential backoff / • Unanchored findings safely demoted to body comment |

---

## Title bar

```
VERCODE — Review Engine Pipeline (Hot Path)
Deterministic-First Analysis · Schema-Enforced AI Reasoning · Transactional Persist-then-Publish
```

## Caption to place above the diagram in the README

```
The hot path from webhook to PR comment runs in six stages. The first two
are cheap and deterministic — no model tokens are spent. Context retrieval
is strictly bounded (60 files / 3 000 lines). Static analysis and the
task-routed LLM pass run in parallel; their outputs are merged,
deduplicated, and filtered before a single transactional write to
Postgres, followed by a GitHub publication call.
```
