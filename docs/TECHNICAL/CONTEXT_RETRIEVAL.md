# VERCODE — Context Retrieval

How the review pipeline obtains the *right* amount of surrounding code for a diff — enough for the model to judge correctness, bounded so it never sends the whole repo (NFR-29).

## 1. The context budget

Per review (default, org-overridable):

| Dimension | Default cap | Behavior on breach |
| --- | --- | --- |
| Files (changed) | 60 | Degrade to the top-60 by risk-tier; the rest are listed in a summary appendix (`over_budget_degraded`) |
| Lines (changed, added+removed) | 3,000 | Same degradation, by risk-tier order |
| Per-file context (surrounding + imports) | ~200 lines of context + 1 hop of imports | Truncation within the file: keep the diff + the nearest enclosing function/class + import block |
| Prompt tokens | ~32k input (per strong-model call) | The engine splits large file sets into batches; each batch is a call; findings merge |

**The budget is a *per-review* resource**, charged against the org's token cap *before* the AI stage (pre-flight, REVIEW_ENGINE_SPEC stage [0]). A review that would exceed it is *degraded*, not failed, and the degradation is stated in the summary (NFR-19).

## 2. What context is retrieved (and why it's bounded)

For each in-scope changed file:

1. **The diff itself** (from GitHub) — the primary subject.
2. **The enclosing definition** — the function/class containing the changed lines (from the file content at head SHA), so the model sees *where* the change sits.
3. **The import block** — top-of-file imports, so type/dependency reasoning works.
4. **1-hop referenced symbols (FR-401)** — for a symbol the diff *uses* (a function call, a type reference), fetch the *definition* of that symbol if it's in a file the PR doesn't otherwise touch, bounded to the definition (not the whole file). This is the "related functions and callers" capability, implemented as a *bounded* fetch, not a repo crawl.
5. **Test-file adjacency (P1, FR-402)** — flag changed files that have a matching test file changed in the same PR; a changed source with *no* changed test gets a low-severity "missing test coverage" hint (deterministic, no AI).

**What is NOT retrieved:** unrelated files, the whole repo, dependency source (node_modules/vendor), generated code (excluded from AI, static-only). The 1-hop import fetch is the *edge* of what's sent to a provider — beyond that, VERCODE does not send repo content (NFR-29).

## 3. Retrieval mechanics (MVP: deterministic, no vectors)

MVP retrieval is **deterministic and cheap** — it's about *bounding and structuring*, not semantic search:

```
changedFiles (from diff)
  → for each: fetch content @ head SHA (GitHub contents API, ETag-cached)
  → parse import statements (lightweight per-language, no full AST for MVP)
  → 1-hop: for each imported symbol used in the diff, fetch its defining file
    (bounded to the definition region; skip if it's a dependency or generated)
  → assemble FileContext[] within the per-file budget
```

No embeddings, no graph DB, no crawl — the *deterministic* bound is the design. This keeps MVP cost and complexity low and keeps the "never send the whole repo" invariant *structural*, not statistical.

## 4. Caching

- **Content cache:** fetched file contents at `(repo, sha)` are cached in Redis (org-scoped key, 24 h TTL). A re-review at the same SHA (or a same-SHA sibling PR) reuses it.
- **Import-graph cache (optional, P1):** per-repo, per-branch import adjacency, invalidated on merge.

## 5. pgvector retrieval (P2, `FR-403`)

For large monorepos where 1-hop deterministic fetch misses the *semantically* relevant code (a helper used across many files):

- An optional per-repo embedding index (pgvector) over public function/method signatures + docstrings.
- **Incremental re-index** on merge (diff the merged files, upsert their embeddings; no full re-crawl).
- **Deletion on access revocation (FR-404):** when an install is removed, the org's embedding index rows are hard-deleted on the retention schedule — no residual codebase representation persists past access (NFR-28/29).
- Retrieval: top-K semantic neighbors of the changed symbols, *bounded* into the same context budget (the P2 capability does not loosen the P0 budget).

The pgvector path is *additive*: a repo that hasn't opted in uses deterministic retrieval only. It's a scale feature, not a correctness requirement.

## 6. Invariants the security suite asserts

| Invariant | Test |
| --- | --- |
| No whole-repo content reaches a provider | `ST-context-bound` — run a review, capture the provider's received prompt, assert the *set of files* in it ⊆ (changed files + 1-hop imports), and that the token count ≤ the review's input budget |
| No dependency/generator source is in scope | `ST-context-clean` |
| Deleted-install embeddings are gone | `ST-embed-purge` (P2) |
| Over-budget reviews degrade, not fail | `UT-budget-degrade` |

## 7. Failure modes

| Failure | Behavior |
| --- | --- |
| A 1-hop import fetch 404s (symbol renamed/moved) | Skip that symbol; the diff + enclosing def still give enough; note a "context incomplete" flag in the finding metadata |
| File content fetch is huge (minified / generated) | Excluded from AI scope (classified generated/minified); static-only |
| Content cache miss + provider tight budget | The engine prioritizes: diff > enclosing def > import block > 1-hop; it drops 1-hop first |
