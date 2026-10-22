# VERCODE — Data Retention

What persists, for how long, and how deletion is enforced. References NFR-27/28 and FR-404.

## 1. Retention schedule (by plan and data class)

| Data class | Free | Developer | Team | Enterprise | Notes |
| --- | --- | --- | --- | --- | --- |
| Findings + review history | 30 d | 90 d | 1 y | custom (≥ 1 y) | The product value; expires by plan window |
| Raw repo content (fetched diffs/file contents) | **ephemeral** | **ephemeral** | **ephemeral** | **ephemeral** | Not stored beyond the review lifetime (NFR-28); a Redis cache with a 24 h TTL, not a DB column |
| `usage_events` | 24 mo | 24 mo | 24 mo | 24 mo (or custom) | Billing + analytics history; append-only, age-hard-delete |
| `audit_events` | 180 d min | 180 d min | 180 d min | 180 d min (or longer) | Compliance floor; append-only |
| `org_billing` + invoices | life of subscription + 24 mo | same | same | same | Finance records |
| `byok_keys` | life of the key (revocable instantly) | same | same | same | Revocation is immediate; the wrapped key row is hard-deleted on rotation/off |
| `webhook_deliveries` | 24 h | 24 h | 24 h | 24 h | The replay-dedup window; pruned after |
| `sessions` | idle 12 h / absolute 30 d | same | same | same | Revocable at any time |
| Embedding index (P2, pgvector) | life of access | same | same | same | **Hard-deleted on access revocation** (FR-404) |

## 2. The enforcement mechanism: `retention_jobs`

Retention is not a `cron delete-where-old` that scans the whole table. It's *scheduled, org-scoped work*:

```
on finding-creation:   schedule retention_jobs(kind=findings_expire, target=job_id, run_at=created_at + plan_window)
on install-removal:    schedule retention_jobs(kind=repo_content_purge, target=repo_id, run_at=now + short_grace)
on org-deletion:       schedule a hard-purge cascade for the org's tenant rows
on audit/usage age-out: the retention queue prunes expired append-only rows in batches (org-scoped, to keep deletes fast — see INDEXING_STRATEGY §5)
```

The **retention queue** (BullMQ `retention-queue`) drains PENDING jobs in `run_at` order. Each is idempotent (a re-run finds the rows already gone → DONE). A FAILED retention job is retried with backoff and *alerted on* — a retention failure is a compliance incident, not background noise.

## 3. The ephemeral-content invariant (NFR-28)

**VERCODE does not retain a customer's source code as a stored asset.** Raw diffs and fetched file contents live *only* in the Redis diff cache (24 h TTL, org-scoped) and, transiently, in the worker's memory for the duration of the review. What we *store* is the **analysis** (findings, summary, usage) — not the code. This is a deliberate privacy posture: VERCODE is a review system, not a code host.

- A finding that *quotes* a snippet of the diff stores that snippet in `review_findings.payload` (bounded) — that's analysis, within the plan retention window.
- The full file contents are **never** written to Postgres (except the bounded, quoted snippet in a finding). `ST-context-bound` + a schema-review gate assert no `raw_content` column exists.
- On **access revocation** (install removed), the cache entries for that org are evicted immediately (not waiting for the 24 h TTL), and any embedding index (P2) is hard-deleted (FR-404).

## 4. Deletion on access revocation (FR-404, AC-204)

`installation.deleted` → the install is marked REMOVED → its `github_repos` set `connected=false` → `retention_jobs(repo_content_purge)` scheduled immediately → the Redis cache for those repos is evicted → the P2 embedding index (if present) is hard-deleted. **Queue-drain:** in-flight jobs for that install finish (no data loss) but do *not* publish (install gone, AC-204). The audit trail for the removed install is kept for 180 d regardless (compliance floor, §1).

## 5. Org deletion (FR-107)

A soft-delete first (`organizations.status=DELETED`): the org's data becomes *unreadable* (the tenancy middleware rejects a DELETED org) but *preserved* for a grace window (for support/compliance) → then the hard-purge cascade (tenant rows) on a retention schedule. The `audit_events` for the org survive the longest (compliance), then are hard-deleted at the age-out. **Recovery window:** a within-grace undo restores the org; after the hard-purge, recovery is from the Postgres PITR backup only (see `OPERATIONS/BACKUP_RESTORE.md`).

## 6. The "data export before hard-delete" rule

Before any hard-purge of findings (retention expiry, org deletion), an **export** of that org's findings/usage is made available (owner/admin) for a short window — the org can download its own analysis history. This is the `usage_events` / findings export capability (AC-405, P1) and is also the *compliance* path: we don't silently delete a customer's data without a final export opportunity.

## 7. Verification

| Test | Assertion |
| --- | --- |
| `IT-retention-01` | A finding whose plan window has passed is hard-deleted by the retention job; the row is gone (not soft-flagged) |
| `IT-retention-02` | An install-removal immediately evicts the org's Redis diff cache + flags the P2 embedding index for hard-delete; raw content is not retrievable after removal |
| `IT-retention-03` | A within-grace org undo restores access; after the hard-purge, the tenant rows are gone and only the surviving `audit_events` remain |
| `ST-ephemeral-content` | No Postgres column stores full file content; the only source text persisted is a bounded finding snippet |
