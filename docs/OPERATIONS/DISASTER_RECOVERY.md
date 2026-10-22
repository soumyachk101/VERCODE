# VERCODE — Disaster Recovery

The "the *whole* region / the whole platform goes away" story. `BACKUP_RESTORE.md` is the *corruption/bad-migration* case (a *known*-good timestamp, a *scoped* restore); this is the *total-loss* case (a region loss, a KMS loss, a provider loss). The DR RTO/RPO are *the* numbers an enterprise deal asks for (`COMPLIANCE_CONSIDERATIONS.md`'s `CC9.6/CC9.7` control family).

## 1. The DR objectives (the stated targets, not aspirations)

| Objective | Target | The design that achieves it |
| --- | --- | --- |
| **RPO** (how much data can be lost) | **≤ 24 h** (a daily logical dump + a *cross-region* copy) — the *PITR* is the *primary-region* continuous layer; a *region* loss falls back to the *last cross-region daily dump* (a ≤ 24 h RPO) | a *cross-region* copy of the *daily* dump (`BACKUP_RESTORE §2.2`'s "the dump is region-replicated"), the WAL is the *primary* region's continuous layer (a region loss *does* lose the WAL *since* the last daily cross-region copy — the *RPO* is *baked into* the "daily cross-region dump" cadence) |
| **RTO** (how long to recover) | **≤ 4 h** (a region-loss recovery: provision a *new-region* instance, restore from the cross-region dump, re-establish the KMS, re-drain the queues, verify) | a *pilot* DR instance (a *warm* standby in a second region, *not* a cold one — the *provisioning* lead-time is *pre-paid*, `§3`) |
| **The audit's 180 d floor survives** | the *audit trail* is *in* the daily dump (the 180 d floor, `NFR-27`) — a *region* loss *does not* lose the *audit* (the audit is *in* the dump, not just the WAL) | the *daily* dump's *retention* is *≥ the audit floor* (a dump that's older than the audit floor is a *compliance* defect, `COMPLIANCE_CONSIDERATIONS §4`'s "the audit's retention exceeds the finding retention" — the *dump* must outlast the *floor*) |
| **The KMS keys survive** | the *KMS* is a *managed, replicated* service (its *own* DR, a *multi-AZ* + a *cross-region* key-replication is the *platform's* control, `BACKUP_RESTORE §1` "a KMS region loss is a KMS DR event"); VERCODE's *ciphertexts* are in the dump (the *key* is in the KMS) | a *key-replication* check (a *DR drill* verifies the *BYOK master* + the *App key* are *replicated* to the *DR region's KMS*, `§4`'s drill) |

**The *honest* RPO:** a *region* loss's RPO is **≤ 24 h** (the *daily* cross-region dump cadence). The *PITR* is a *finer* (continuous) layer *within* the *primary* region (a *corruption* in the *primary* → a PITR to a *second*-ago; a *region* loss → the *daily* cross-region dump). **The two RPOs are *different*: a *primary-region corruption* is a *near-zero* RPO (the PITR); a *region loss* is a *≤ 24 h* RPO (the daily dump). The enterprise commitment states *both* (a "continuous within a region, daily across regions" RPO, not a misleading "we have PITR" that *doesn't* survive a *region* loss).**

## 2. The DR topology (a warm second region, not a cold one)

```
primary region (us-east-1, say)              DR region (us-west-2, say)
  managed Postgres (PITR + WAL)                 [pilot] managed Postgres (a warm standby,
  managed Redis                                 [restored from the daily cross-region dump])
  KMS (App key, BYOK master)                    [pilot] KMS (a *replicated* CMK)
  api / worker / web (the primary deploy)        [pilot] a *standby* deploy (read-only, the
                                                  [daily] dump + a promoted-on-failover state)
```

- **The *warm* pilot** (a *second-region* instance that's *provisioned* + *restored-from-the-daily-dump*, a *read-only* standby, *not* a full active-active): the *provisioning lead-time* is *pre-paid* (a *cold* "provision from scratch on a DR" is a *multi-hour* risk; a *warm* pilot cuts the *provisioning* to the *promotion*).
- **The *daily* cross-region dump** (the `BACKUP_RESTORE §2.2` "the dump is region-replicated" — the *daily* logical dump ships to the *DR region*, the *Pilot* is *restored* from it (a *≤ 24 h* RPO), and *promoted* on a region-failover (the *pilot* becomes the *primary*).
- **The *KMS key-replication*** (a *BYOK master* + the *App key's* CMK are *replicated* to the *DR region's* KMS, a *platform* DR control, `BACKUP_RESTORE §1` "a KMS region loss is a KMS DR event" — VERCODE's *DR drill* *verifies* the replication, it doesn't *own* it).
- **The *stateless* `api`/`web`** (a *cold* deploy in the DR region is *fine* — they're stateless, the *worker* is the one that *scales* + the one that *drains*; a *worker* in the DR region is a *cold* start (the *durable* queue is in the *primary* Redis — a *region* loss of the Redis *means* the queue is *re-drained* from the *Postgres* (a *job* is a *durable* `review_jobs` row, the *queue* is a *delivery* mechanism, `SERVICE_BOUNDARIES` "a job payload is a pointer" — a *queue* loss *does not* lose a *job*, the `review_jobs` row is the *source of truth*, the queue *re-enqueues* from the `queued`/`running` rows)).

**The *key* DR property:** a *queue* loss (a *Redis* region loss) is *not* a *job* loss (a *durable* `review_jobs` row + a *re-enqueue-from-DB* path, `BACKUP_RESTORE §1` "a Redis loss means a requeue of in-flight jobs, a bounded re-runnable loss, the idempotency key makes a re-run safe"). The *queue* is a *delivery* mechanism, the *job* is a *DB row* — a *region* loss *rebuilds* the queue from the DB, it *does not* lose a review.

## 3. The DR procedure (the region-failover runbook)

1. **Declare the region-failover** (a SEV-1, the *INCIDENT_RESPONSE* SEV-1 procedure: the IC + the handler + the comms, the *timeline*).
2. **Promote the *warm* pilot** (the DR region's Postgres is *promoted* from the *last cross-region daily dump* — a *≤ 24 h* RPO; the *PITR* is *primary-region* only (a *region* loss *means* the *WAL* is gone, the *dump* is the *floor*). The *promotion* is a *named* operation (a "promote the standby to primary" in the managed-Postgres, not a "we hope the data's fine").
3. **Re-establish the KMS** (the *BYOK master* + the *App key* CMK in the *DR region's* KMS, a *key-replication* verification — the *ciphertexts* are in the dump, the *key* is in the KMS, `BACKUP_RESTORE §3.2`).
4. **Re-drain the queues** (a *worker* in the DR region *re-enqueues* from the `review_jobs` `queued`/`running` rows (a *queue* rebuild from the DB, the *durable* job rows, `§2`'s "a queue loss is not a job loss"); the *idempotency* key makes a *re-run* safe (NFR-13, a *redelivered* job for a completed key no-ops)).
5. **Promote the *stateless* `api`/`web`** (a *cold* deploy in the DR region — they're stateless, the *deploy* is a `DEPLOYMENT §4` roll-out against the *promoted* Postgres).
6. **Verify** (the *health endpoints* + a *canary review* against the *promoted* data + the *integrity check* (a `succeeded`/`usage_events` reconciliation, `ERROR_HANDLING §6`) + the *audit's 180 d floor* is *present* in the promoted DB (a *query* for the oldest audit row — a *compliance* floor that *must* survive a *region* loss, `COMPLIANCE_CONSIDERATIONS §4`'s "the audit's retention exceeds the finding retention")). A *verified* DR (a `DEPLOYMENT §7` "verify, don't assume").
7. **The *failback*** (a *planned* failback to the *primary* region, a *separate* operation — a *region* is *not* auto-failed-back (a *failback* is a *maintenance* window, not a *recovery* urgency; the *primary* region is *rebuilt* + the *PITR* is *re-established* + the *data* is *re-synced* from the *DR* (a *DR-to-primary* re-sync, a *lower-urgency* operation than the *primary-to-DR* failover).

## 4. The DR drills (the DR is *proven*, not just documented)

| Drill | Cadence | What it proves |
| --- | --- | --- |
| **The *cross-region daily-dump* restore** (a *DR region* restore from the *last cross-region dump* + a *read* against it + the *integrity check* + the *audit floor* is *present*) | A rotation (the *daily* dump rotation, a *restore* drill on a *separate* schedule from the *primary* PITR drill, `BACKUP_RESTORE §4`) | The "can we *promote* from the *daily* cross-region dump?" answer is *current* (a *region*-loss RPO of *≤ 24 h* is *proven*, not assumed) |
| **The *KMS key-replication* check** (a *BYOK master* + the *App key* CMK *are replicated* to the *DR region's* KMS; a *decrypt* of a *BYOK key* in the *DR region* works) | Quarterly (a *drill* that *verifies* the *platform* KMS replication, `§2`) | A *region* loss *does not* lose the *BYOK* decryption (the *key* is in the *DR* KMS, the *ciphertext* is in the *dump* — both *survive*) |
| **The *queue re-drain* from the DB** (a *region* loss of the *Redis* → the *worker* *re-enqueues* from the `review_jobs` `queued`/`running` rows; a *completed* job's re-delivery *no-ops* (the idempotency key, NFR-13)) | Quarterly (the *INCIDENT_RESPONSE §7* "queue re-drain" drill, the *region* case) | A *queue* loss is *not* a *job* loss (the *durable* job rows are the *source of truth*, `§2`) |
| **The *full region-failover* game-day** (a *simulated* primary-region loss → the *pilot* is *promoted* → the *KMS* re-established → the *queues* re-drained → the *stateless* promoted → the *integrity* + the *audit floor* verified → a *canary* review) | Annually (a *full* game-day, the *INCIDENT_RESPONSE* quarterly drills' *annual* superset) | The *whole* region-failover runbook (`§3`) is *drilled* end-to-end (a "we *can* fail over a region" claim is *proven*, not a *paper* DR) |

**The DR is *complete* only when the *game-day* has run** (a *DR plan that hasn't had a *failover* drill* is a *hope*, not a *DR*, `BACKUP_RESTORE §4`'s "a backup that hasn't had a restore run is not a backup" applied to *DR*).

## 5. The *compliance* tie-in (the DR is a *control*, not just an *ops* doc)

A *region* loss is the *CC9.6/CC9.7* (Business Continuity / DR, `COMPLIANCE_CONSIDERATIONS §2`) *control family's* *evidence* (a *SOC 2* auditor asks: "what's your *RPO/RTO*, and have you *tested* it?" — the *answer* is `§1`'s targets + `§4`'s *game-day* results). A *region*-loss *DR* that *hasn't* been *drilled* is a *compliance gap* (a "we *could* recover" claim, not a "we *have* recovered" evidence). The *DR drill* records are the *audit evidence* (a *game-day report*, the *RPO/RTO* actually *achieved*, not the *target*).

The *data-residency* commitment (a *Phase 3* enterprise feature, `FEATURE_ROADMAP` / `COMPLIANCE_CONSIDERATIONS §6` "a residency commitment is not made until Phase 3 delivers it") is *built on* this DR topology (a *per-region* deployment is the *warm-pilot* generalized to *multiple* regions — a *region*-loss DR is the *single-region* case, a *residency* DR is the *multi-region* case, the *architecture* is *region-portable* (`COMPLIANCE_CONSIDERATIONS §6` "the architecture is region-portable — state lives in Postgres + Redis, no region-coupled logic")).

## 6. What DR does *not* cover (stated, the honest limits)

- **A *KMS* region loss is a *platform* DR event** (a *VERCODE* DR *verifies* the *key-replication*, it *does not own* the *KMS's* DR — the *KMS* is a *managed* service with its own *multi-AZ + cross-region* replication, `BACKUP_RESTORE §1` "a KMS region loss is a KMS DR event, not a VERCODE backup").
- **A *provider* (the AI / the GitHub) outage is *not* a *VERCODE* DR event** (a *provider* going away is a *dependency* failure, a *degradation* (the *partial*-review path, `INCIDENT_RESPONSE §5` "a provider outage is a degradation, not a SEV-1"), *not* a *platform* DR — a *provider* DR is the *provider's* control; VERCODE's *DR* is its own *data* + its *stateless* services).
- **A *cross-region* *WAL* (a *continuous* cross-region replication) is a *future* *RPO* improvement** (the *daily* cross-region dump is the *RPO* floor; a *continuous* cross-region *WAL* replication is a *Phase 3* *RPO* tightening, a *daily* → a *near-zero* cross-region RPO, a *documented* *known-limitation*, `IMPLEMENTATION/KNOWN_LIMITATIONS.md`).
