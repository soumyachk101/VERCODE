# VERCODE — Backup & Restore

The data-protection story for the two stateful deps (Postgres, Redis) + the *ephemeral-by-design* data that has *nothing* to back up (the whole point of `DATA_RETENTION.md` §3: there's no customer codebase stored, so the backup surface is small and bounded).

## 1. What's backed up (and what deliberately isn't)

| Data | Backed up? | How | RPO | RTO |
| --- | --- | --- | --- | --- |
| **Postgres** (orgs, reviews, findings, usage, audit) | **Yes** | Managed PITR (point-in-time restore, continuous WAL archiving) + a daily logical dump (a `pg_dump`, a 24-h retention minimum, a 7-d daily-rotation) | **Continuous** (PITR) / 24 h (the logical dump) | **≤ 1 h** (PITR to a timestamp) |
| **The audit trail** (`audit_events`, 180 d floor) | **Yes** (the PITR *is* the audit's storage) | The PITR retains the audit rows for the 180 d floor (the *retention* of the audit is the PITR's *window*, `NFR-27`) | continuous | ≤ 1 h |
| **Redis** (sessions, the BullMQ queues, the diff cache) | **Partially — only the queues** | Redis *persistence is NOT the backup*: the queues are *durable* by design (BullMQ's jobs survive a Redis restart via the queue's own persistence), so a Redis loss means a *requeue* of in-flight jobs (a bounded, re-runnable loss, the idempotency key makes a re-run safe, NFR-13) — a sessions loss means a *re-login* (a low-impact loss). The **diff cache** is *not* backed up (it's ephemeral, 24 h, re-fetchable from GitHub, NFR-28) | n/a (re-runnable) | the queues re-drain |
| **The KMS keys** (the App private key, the BYOK master) | **No — the KMS *is* the backup** | The KMS is a managed, replicated service (its own durability); the *ciphertexts* in Postgres are backed up by the Postgres PITR (the wrapped key + the KMS key id + the last-4). A KMS region loss is a *KMS* DR event (the platform's control, `DISASTER_RECOVERY.md`), not a VERCODE backup | n/a (managed) | the KMS's RTO |
| **Customer source code** | **No (by design)** | There is *no customer code stored* (NFR-28, `DATA_RETENTION §3`) — the review *analysis* is backed up, the *code* is not (there's nothing to restore). This *reduces* the backup surface: a VERCODE restore never restores a customer's repo (a customer's code is re-fetchable from *their* GitHub, not from VERCODE) |

**The key property:** VERCODE's backup is *small and bounded* because the product *is* a review system, not a code host. A Postgres PITR + a daily dump is the whole story; there's no multi-petabyte code-store to replicate.

## 2. Postgres: the two layers

### 2.1 PITR (the primary layer)
- The managed Postgres has **continuous WAL archiving** (point-in-time restore to any timestamp in the retention window). The PITR window is **≥ the audit's 180 d floor** (the audit record *needs* to survive 180 d; the PITR window is set to cover it, `NFR-27`).
- **The PITR is the audit trail's storage** (`OBSERVABILITY §7`): a security investigator restores *to* a timestamp to see the audit rows for that window — the audit's *compliance* retention *is* the PITR's *capability*.

### 2.2 The daily logical dump (the secondary + the export layer)
- A `pg_dump` (a custom-format, compressed) every 24 h, a 7-d daily-rotation (a *separate* copy, not the WAL — a PITR *and* a logical dump, defense in depth: the WAL is the *continuous* layer, the dump is a *known-good* daily anchor + a portable export).
- **The dump is the *data-export* capability** (`DATA_RETENTION §6`): an org's *findings/usage export* (AC-405) is sourced from the dump + the live rows, not a one-off scrape (an export is a *repeatable*, *auditable* operation).
- **The dump is region-replicated** (the PITR + the dump are in the same *primary* region; a *cross-region* copy of the *daily* dump is the DR layer, `DISASTER_RECOVERY.md`).

## 3. The restore procedure (the runbook)

### 3.1 A *corruption / bad-migration* restore (the common case, RTO ≤ 1 h)
1. **Identify the last-known-good timestamp** (the audit row / the deploy record + the canary check that went green, `DEPLOYMENT §4`).
2. **Provision a *new* Postgres instance** (a PITR *to* that timestamp — a PITR is a *restore-to-a-new-instance*, not an in-place overwrite: the *original* is preserved for forensics, never destroyed by the restore).
3. **Point the deploy at the new instance** (a `DATABASE_URL` switch, the `api`/`worker` reconnect; the *old* instance is held read-only for the forensic window).
4. **Reconcile** (the *integrity* check: a `succeeded`-job-without-`usage_events` scan returns zero, `ERROR_HANDLING §6`; the audit's 180 d floor is intact (a query for the oldest audit row ≥ 180 d ago *within* the window)).
5. **Verify** (the health endpoints + a canary review against the restored data — a *verified* restore, `DEPLOYMENT §7`'s "verify, don't assume").

### 3.2 A *total region loss* restore (the DR case, RTO the DR window, `DISASTER_RECOVERY.md`)
1. **Restore from the *cross-region* daily dump** (the most recent ≤ 24 h) *or* the cross-region PITR (if the PITR's WAL shipped cross-region).
2. **Re-establish the KMS keys** (the wrapped key id + the KMS CMK — a KMS *key* that didn't replicate is a KMS-DR event, `DISASTER_RECOVERY.md`; the *ciphertexts* are in the dump, the *key* is in the KMS).
3. **The queues re-drain** (the BullMQ jobs are re-enqueued; the idempotency key makes a re-run safe, NFR-13; a *redelivered* job for a completed key no-ops, `INTEGRATION_TEST_PLAN §3`).
4. **The audit trail** is re-established from the dump (the 180 d floor is *in* the dump, not lost).

### 3.3 A *single-org* restore (the "undo a bad org-deletion" case, the grace window)
- An org soft-delete (`organizations.status=DELETED`, the *grace* window, `DATA_RETENTION §5`) is *reversible* within the grace: a *targeted* PITR *of the org's rows* to the pre-delete timestamp restores *that org's* data (a *scoped* restore, not a whole-instance one — the org-scoping means the restore is bounded to one tenant's rows, a faster + safer operation than a full PITR).

## 4. The test (the backup is *proven*, not assumed)

| Test | What it proves |
| --- | --- |
| `ops-backup-01` (a scheduled test, not a PR test) | A daily `pg_dump` is *restorable*: a dump → a fresh instance → the integrity check (a `succeeded`/`usage_events` reconciliation) passes + the audit's 180 d floor is present |
| `ops-backup-02` | A PITR to a chosen timestamp: a *new* instance is restored + a *query* against the restored data returns the expected rows (a "restore + read" round-trip, not just a "restore" claim) |
| `ops-backup-03` | A *scoped* org restore (a soft-deleted org, within the grace): the org's rows are restored + the *other* orgs' rows are untouched (a tenant-scoped restore, not a whole-DB clobber) |
| `ops-queue-04` | A Redis loss: the queues *re-drain* (a job that was in-flight is re-queued + a completed job's re-delivery no-ops, the idempotency key, NFR-13) |

**A backup that hasn't had a *restore* run against it is not a backup** (the runbook's "restore + read + verify" round-trip is the acceptance, not the dump file's existence). The scheduled test (`ops-backup-*`) runs a *restore* on a *test* instance on a rotation (a 7-d dump-rotation → 7 restore-drills, one per dump), so the "can we restore?" answer is *current*, not a 30-day-old assumption.

## 5. The "nothing to back up" property (the design dividend)

Because VERCODE *stores the analysis, not the code* (`DATA_RETENTION §3`), the backup story is *dramatically* simpler than a code-hosting SaaS:

- **No customer-repo replica** to keep in sync (a code host's "back up the whole repo" is a *continuous* replication problem; VERCODE has *no* such surface — the code is re-fetchable from the customer's GitHub, `DATA_FLOW.md`'s "raw content is ephemeral" invariant).
- **The backup surface is the relational DB** (the reviews, findings, usage, audit, config) — a *bounded*, *daily-dump-able*, *PITR-able* surface.
- **The Redis surface is *re-runnable*, not *restorable*** (the queues + the cache + the sessions all *rebuild* from a loss, the idempotency key + the GitHub re-fetch + the re-login — a Redis loss is a *degradation*, not a *data loss*).

This is the *privacy* design's *operational* payoff: the "we don't store your code" posture (`PRIVACY.md`) is what makes the backup small, bounded, and provable.
