# VERCODE — AI Evaluation

The AI review pipeline's *quality* is a measured property with a release gate. "The review is good" is not a claim without a number. This document defines how we measure it (`SUCCESS_METRICS.md`'s quality gates: the benchmark precision must not drop > 5% between releases; a security-finding under-report is a release block).

## 1. What we measure (the metrics, with definitions)

| Metric | Definition | Target | Source |
| --- | --- | --- | --- |
| **Precision** | published findings that are *real defects* / all published findings | the gate: ≥ the baseline, no > 5% regression | the benchmark (below) + the production dismiss-rate |
| **Recall (per class)** | for each category, real defects found / real defects present in the fixture | the security class has the *highest* recall floor (a missed security vuln is the costly error, `MODEL_ROUTING §2` "never downgrade security-review for cost") | the benchmark |
| **False-positive rate** | published findings that are *not* real defects / all published (1 − precision) | the dismiss-rate target ≤ 35% (`SUCCESS_METRICS`) | the production `finding_actions` (`dismissed_unreasonable`) |
| **Actioned-finding rate** (the north-star) | findings acted on within 7 days / published findings | ≥ 18% (Team+) / ≥ 10% (Free/Dev) | `finding_actions` (production) |
| **Anchor success rate** | inline-published findings / (inline + anchor-fallback) | ≥ 92% (AC-305 area, NFR) | `review_findings.anchor_status` |
| **Latency p50/p95** | webhook → GitHub publish | p50 < 120 s, p95 < 300 s (NFR-02) | `review_jobs.created_at`/`finished_at` |
| **Failure rate** | `failed` jobs / (completed + failed), excluding skips | ≤ 1% (NFR-01 ≥ 99% success) | `review_jobs.status` |
| **Cost / review (blended)** | `sum(est_usd_cost)` / completed jobs, per plan tier | Free/Dev ≤ $0.15, Team ≤ $0.35 at p95 (`SUCCESS_METRICS`) | `review_jobs.est_usd_cost` |
| **Confidence calibration** (per floor) | at a confidence floor of *f*, the *actual* precision of findings ≥ f | a measured curve (a floor at 0.6 → ~X% precision), *not* an assumed one (the brief: "Do not assume confidence scores are calibrated probabilities") | the benchmark |

## 2. The benchmark dataset (drive `BENCHMARK_DATASET.md`)

A *versioned* set of PR diffs, each with a **ground-truth finding set** (the known defects a senior engineer would flag + the clean files that must *not* be flagged). The set is the *held-out* set the model/prompt is evaluated on.

**The composition (the known-bug + clean examples, from the brief's Phase 6):**

| Class | Examples (the positive fixtures) | The negative (clean) fixtures |
| --- | --- | --- |
| **Logic bug** | an off-by-one in a pagination loop; a `==` vs `===` that breaks a type check; a null-deref on an optional field | a correct loop, a correct guard |
| **Security** | SQL string-concatenation; a missing auth check on a route; an unsafe `JSON.parse` of untrusted input with a prototype-polyfill risk; a hardcoded secret | a parameterized query, a guarded route |
| **Exception handling** | a swallowed `catch {}`; a missing `await` on a rejected promise; a resource opened but not closed on the error path | a closed resource, a rethrown error |
| **Race condition** | a read-modify-write without a lock; a double-increment on a counter; a non-atomic check-then-act | a locked / atomic version |
| **Performance** | an N+1 query in a loop; a `O(n²)` sort where a hash works; an unbounded cache (no eviction) | the batched query, the O(n) version |
| **Resource leak** | an open socket/DB-handle not released; an unsubscribed event listener; a growing buffer with no cap | the closed handle, the removed listener |
| **API contract** | a response field renamed without a deprecation; a breaking enum value; a required field dropped from a payload | a backward-compatible change |
| **DB consistency** | a multi-row update without a transaction; a delete that leaves an orphan FK; a counter that can't go negative | a transactional update |
| **Edge case** | an empty-array / zero / negative / unicode / locale edge not handled; a timezone/DST boundary | the handled edge |
| **Injection (the security-suite crossover)** | a PR *designed to* steer the AI (an "ignore previous instructions" in a body/file, `ST-injection-*` fixtures are *in* the benchmark) | a benign discussion of prompt-injection (a security team's research PR) that must *not* be a "malicious" flag |

**The scale:** a *starter* set of ~60 fixtures (20 per top class: ~10 positive + ~10 clean + a handful of the injection crossover) is the MVP benchmark; it grows as real dismisses are labeled (the production flywheel, below). The set is **versioned** (a `benchmark/v1` with a manifest); a prompt/model change is evaluated against the *same* version so the comparison is like-for-like.

## 3. The evaluation protocol

1. **Run the pipeline** (a deterministic harness, not the production worker) over the benchmark set, with the *current* routing table + prompt version. Capture: the published findings, the dropped/invalid/deduped counters, the cost, the latency.
2. **Score against the ground truth:**
   - **Precision** = |predicted ∩ real| / |predicted| (a predicted finding that isn't a real defect = a FP).
   - **Recall (per class)** = |predicted ∩ real-in-class| / |real-in-class| (a missed real defect = a FN). The **security class recall** has the highest floor (a missed security vuln is the costly error — the routing never downgrades it for cost, `MODEL_ROUTING §2`).
   - **Anchor success** = the fraction of findings whose line resolved (the `anchor_failed` demotes are counted).
   - **Cost/review** + **latency** are recorded (the cost ceiling + the NFR-02 budget are part of the gate, not just the quality).
   - **Injection outcomes** = for the injection fixtures: *no* system-prompt leak, *no* secret in a finding, *no* silenced deterministic finding, *at most* a finding-about-the-injection (the `ST-injection-*` assertions are the benchmark's security fixtures).
3. **The confidence-curve:** sweep the floor (0.4–0.9) and record the *actual* precision at each floor (the calibration curve, the "don't assume calibrated" rule). The default floor (0.6) is chosen from *this* curve, not a guess — the floor that hits the ~35% dismiss target.
4. **Gate the release:**
   - **Precision regression > 5%** → the release is blocked (a model/prompt swap that tanks precision ships nothing).
   - **Security-class recall regression > 3%** → a *hard* block (a missed security vuln is not a "known tradeoff").
   - **Cost/review over the plan ceiling** → a routing-table fix (the cheap-triage gate, `MODEL_ROUTING §2`), not a release.
   - **An injection-outcome regression** (a leak / a silenced deterministic finding) → a *security* block (it's in the `ST-injection-*` release gate, not just the benchmark).

## 4. The production flywheel (continuous, not just at release)

The benchmark is a *snapshot*; production is the *stream*:

- **The `finding_actions` data** (a developer marks a finding `accepted`/`fixed` = a true positive; `dismissed_unreasonable` = a false positive) is the *real* precision signal. A periodic (weekly) job rolls a *sample* of recently-actioned findings into the benchmark's labeled set (a labeled example: "this finding was dismissed as unreasonable → a negative"). This grows the held-out set with *real* orgs' data (anonymized, the org is not identifiable from the fixture — the flywheel respects tenancy + privacy: it's a *finding*, not the code, that's labeled).
- **The dismiss-rate alert:** a rising `dismissed_unreasonable` rate (the false-positive gate, `SUCCESS_METRICS`) triggers a prompt/routing review *before* it becomes a benchmark regression. A dismiss-rate that's *flat or down* is the product's trust signal (a developer who keeps reading the bot = the bot is working).
- **The per-org preference (P3, the "QA flywheel" from the roadmap):** an org's dismissed findings feed a *per-org* preference adjustment (the org's own noise profile), *not* the global prompt. (A per-org preference model is P3; the MVP is a global benchmark + a per-org floor/suppression, `FR-308`.)

## 5. The "never claim without measurement" rule

The brief: "Measure actual review precision, false positives, latency, failure rate, cost per review. **Never claim performance results without measured evidence.**"

- **No marketing claim** ("99% accurate", "catches more bugs than X") is written anywhere (the docs, the marketing site, a PR description) *without* the benchmark number + the version + the run date. A claim cites `benchmark/vN, run <date>, precision <X>%`.
- **The dashboard's "review success rate" and "actioned-finding rate" are computed from stored rows** (the `SUCCESS_METRICS` definitions, the *measured* values), never a hard-coded "looks about 95%" figure.
- **A release report** states the benchmark gate results (precision, security-recall, cost, the floor) for the *exact* model + prompt version that shipped — a reviewer can re-run the benchmark at that version and get the same number (reproducibility: the benchmark + the routing table + the prompt version are all versioned + the harness is deterministic).

## 6. The baseline (what "no regression" means)

The **MVP baseline** is the first benchmark run against `benchmark/v1` with the default routing table + `promptVersion` (the shipped defaults). A release "passes" if: precision ≥ baseline − 5%, security-recall ≥ baseline − 3%, cost/review within the plan ceiling, injection outcomes clean, and the anchor-success ≥ 92%. The baseline number is recorded in the release report (the "as of this release, benchmark/v1 precision is X%" — the measured, versioned, reproducible figure, the anti-vibes gate).
