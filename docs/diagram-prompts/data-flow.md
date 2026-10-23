# VERCODE Review Data Flow & Lifecycle — Prompt

> **Output format:** PNG (rendered from SVG source; keep the SVG on disk as the
> source of truth, export at 2× scale for crispness). Save to
> `docs/assets/data-flow.png`. The SVG stays at `docs/diagrams/data-flow.svg`
> (note: this diagram lives under `docs/diagrams/`, not `docs/assets/`).
> **Canvas:** 1020 × 540. PNG export: 2040 × 1080 px.

---

## Title bar

```
VERCODE — Review Data Flow & Lifecycle
Constant-latency webhook ingest · Bounded diff retrieval · Deterministic-first
dual analysis · Persist-then-publish
```

---

## Layout: 3 rows of step cards, snaking left → right → left → right

8 step cards total. Each card: white fill, 1.2 px border, 3 px colored top strip,
rounded corners (rx = 10). Card sizes: 280 × 96 (top row), 280 × 120 (middle row),
450 × 114 (bottom row).

### Row 1 (y = 80, top strip): 3 cards, 280 px wide, 96 px tall, x = 40 / 370 / 700

| Step | Top strip | Title | Sub title | Bullets (one line each, 10 px) |
| --- | --- | --- | --- | --- |
| **1. WEBHOOK INGRESS** | red `#ef4444` | Verify & Enqueue (< 300 ms) | • HMAC-SHA256 signature + 5-min timestamp window / • 24 h delivery dedup · Enqueue review-queue / • **Returns 202 Accepted; zero LLM hot path** (bold red) | |
| **2. JOB DISPATCH & GATES** | orange `#ea580c` | BullMQ Worker Dequeue | • Worker dequeues `{ jobId }` pointer from Redis / • Re-reads durable state from PostgreSQL / • **Same-SHA check & quota pre-flight gates** (bold orange) | |
| **3. CONTEXT RETRIEVAL** | blue `#2563eb` | Bounded Diff & AST | • Octokit fetches raw PR diff via App token / • 1-hop AST imports (capped: 60 files / 3 k lines) / • **Cached in Redis with 24 h TTL** (bold blue) | |

### Row 2 (y = 230): 3 cards, 280 px wide, 120 px tall, x = 40 / 370 / 700

| Step | Top strip | Title | Sub title | Bullets |
| --- | --- | --- | --- | --- |
| **4. STATIC ANALYSIS (RULES)** | green `#10b981` | Deterministic AST Scan | • ESLint + Semgrep runner subprocesses / • 100% reproducible; zero AI token cost / • Authoritative findings; exempt from confidence floor / • **Detects syntax, security & logic bugs** (bold green) | |
| **5. TASK-ROUTED AI** | purple `#8b5cf6` | Schema-Validated Reasoning | • Triage pass → deep review high-risk / • Dedicated security review pass / • Outputs validated against contracts Zod schemas / • **Models: OpenAI GPT-4o / Claude / Ollama** (bold purple) | |
| **6. POLICY & DEDUP** | indigo `#6366f1` | Anchor Check & Filtering | • Match finding lines against unified diff / • 3-tuple dedup: (file, line, category) / • Filter below confidence floor (0.6 default) / • **Apply per-repository suppressions** (bold indigo) | |

### Row 3 (y = 396): 2 wide cards, 450 px wide, 114 px tall, x = 40 / 530

| Step | Top strip | Title | Sub title | Bullets |
| --- | --- | --- | --- | --- |
| **7. PERSIST-THEN-PUBLISH** | teal `#0d9488` | Transactional PostgreSQL Write & GitHub Publication | • Insert `review_findings`, update `review_jobs`, record `audit_events` / • Post validated inline comments + summary verdict to GitHub PR / • **Fallback to PR-body comment if line anchor fails verification** (bold teal) | |
| **8. RESILIENCE & QUOTA AUDIT** | green `#059669` | Wall-Clock Budget & Token Attribution | • Wall-clock timeout (240 s) yields partial results instead of hanging / • Rate-limit 403/429 backs off exponentially through retry queue / • **Attribution of token spend and prompt version to tenant org** (bold green) | |

---

## Flow arrows (grey `#64748b`, 1.5 px, with arrow markers)

Serpentine / snake layout:

1. Card 1 → Card 2 (horizontal, y ≈ 128)
2. Card 2 → Card 3 (horizontal, y ≈ 128)
3. Card 3 → Card 4 (orthogonal: down from Card 3 bottom-center, left along the gap, into Card 4 top-center) — y ≈ 176 → 222
4. Card 4 → Card 5 (horizontal, y ≈ 290)
5. Card 5 → Card 6 (horizontal, y ≈ 290)
6. Card 6 → Card 7 (orthogonal: down from Card 6 bottom-center, left along the gap, into Card 7 top-center) — y ≈ 350 → 388
7. Card 7 → Card 8 (horizontal, y ≈ 453)

Use rounded corners (rx = 2) on the orthogonal path segments where the arrow turns.

---

## Caption to place above the diagram in the README

```
A single webhook event flows through eight stages. The first three are
cheap and deterministic — no model tokens are spent. Steps 4 and 5 run
in parallel: static analysis grounds the review, the task-routed LLM
pass adds reasoning on top. Their outputs merge at step 6 (dedup +
confidence floor), then flow through a single transactional write
before being published back to GitHub. Step 8 handles the resilience
guarantees: timeouts, rate-limit backoff, and per-org token attribution.
```
