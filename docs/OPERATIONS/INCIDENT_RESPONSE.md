# VERCODE — Incident Response

The procedure for the "something is broken and it's not just a bug" cases. An incident is *managed*, not *discovered in a thread*: a named severity, a named owner, a timeline, and a *post-incident* that's as much about the *system fix* as the apology.

The governing invariants (from the rest of the docs): **a failure is observable** (`OBSERVABILITY.md`, DEFINITION OF DONE #12), **the audit trail survives** (`BACKUP_RESTORE.md` — the PITR *is* the audit's storage), and **a suspected secret-leak is answered with a rotation, not just a cleanup** (`SECRETS_MANAGEMENT.md` §6).

## 1. Severities (the named scale)

| Severity | Definition | Examples | Response time |
| --- | --- | --- | --- |
| **SEV-1** (critical) | A *tenant-breach-class* or *total-outage* event | a cross-tenant row served (T-02 realized); a secret/platform-key leak (T-05/T-04); a *confirmed* prompt-injection that exfiltrated a secret (T-06); a Postgres loss with no PITR; a *provider outage that makes the whole product unavailable* | **immediate** (a page, a war-room within 15 min) |
| **SEV-2** (high) | A *major-degradation* that a workaround doesn't fully cover | the AI provider is down (a *partial*-review degradation, not a total outage — the deterministic stage still works, ADR-005); a *sustained* p95 latency breach (NFR-02); a *DLQ flood* (a queue back-pressure incident) | **within 1 h** (a named owner, a status page) |
| **SEV-3** (medium) | A *localized* defect or a *single-org* issue | a *specific* routing-table change regressed one org's review quality (the benchmark gate *should* have caught it — the incident is the "why did the gate pass"); a *single* repo's GitHub rate-limit exhaustion | **next business day** (a ticket + the owner) |
| **SEV-4** (low) | A *cosmetic / no-customer-impact* issue | a dashboard label is wrong; a non-blocking 500 on a *dev-only* path | *normal* ticket cadence |

**The severity is *decided by the customer-impact class*, not the effort-to-fix** (a *small* code change that *fixes a SEV-1 leak* is still a SEV-1 response, not a SEV-4 "I'll do it later").

## 2. The roles (named, not a crowd)

- **The Incident Commander (IC):** owns the *timeline* + the *communication* + the *decision*. Not the person who's *fixing* the bug (a separate role, the **handler**). The IC escalates, writes the status updates, and makes the "we rotate the key / we roll back / we page the second on-call" calls.
- **The Handler:** the engineer who's *diagnosing + fixing* (the one with the code/DB/queue open). Reports *findings* to the IC; the IC reports to the *outside* (the status page, the customer comms). **The handler is not the communicator** (a handler who's both diagnosing and writing customer comms does neither well).
- **The Comms owner:** writes the status-page update + the customer email (a SEV-1's customer comms is a *named* person, not the IC's side-job).
- **The On-call (the rotation):** the *first* responder (the one who triages SEV-1/SEV-2 within the response time). The on-call *pages* the IC + the handler (a SEV-1 is a *page*, not a ticket).

## 3. The SEV-1 procedure (the critical path, in order)

1. **Declare + assemble** (the IC pages the handler + the comms owner; a war-room within 15 min, the *named* roles, a *timeline* opened).
2. **Contain *first*, fix *second*** (the #1 rule: *stop the bleeding* before *understanding the root cause*). A SEV-1 leak is *contained* by **rotating the compromised secret / revoking the compromised token / disabling the compromised path** (a `SECRETS_MANAGEMENT §6` "a suspected leak → rotation" response) *before* the root-cause is known. A SEV-1 outage is *contained* by a **rollback** (the previous image, `DEPLOYMENT §6`) *before* the fix is known.
3. **Protect the *audit*** (the PITR is *running* — a SEV-1 that's also a *data* incident (a tenant breach, a bad-migration data-loss) needs the *audit trail* intact for the *investigation*; the PITR's 180 d floor (`NFR-27`) is the *record*, `BACKUP_RESTORE.md` §2.1 — a SEV-1 investigation *cannot* "clean up the evidence").
4. **Diagnose** (the handler, with the *correlation id* — the `job_id`/`user_id`/`org_id` thread: the log + the trace + the Sentry event + the audit row all join on it, `OBSERVABILITY §1`). A SEV-1 is *rarely* "we don't know what happened" — the observability is *designed* for this (a "the failure is observable" invariant, not a hope).
5. **Mitigate / fix + verify** (the fix is *verified* the same way a deploy is — the health checks + a canary + a *targeted* reproduction, `DEPLOYMENT §7`; a fix that "seems to work" is not a fix, it's a *maybe*).
6. **Communicate** (the comms owner: the status page, *then* the customer email for a SEV-1; the *customer* is told *what happened, what's affected, what we did, and what's next* — not a "we're aware" non-answer).
7. **Close + post-incident** (a *blameless* post-incident within 5 business days: the *timeline*, the *root cause* (the system cause, not the person), the *actions* (each with a named owner + a due date), and the *system fix* that makes it *un-possible*, not just *re-fixed* (a SEV-1 that's "fixed" by a human being more careful is *not* fixed — it's a *system* fix: a gate, a test, an invariant).

## 4. The *security*-incident branch (the SEV-1s that are *leaks*)

A SEV-1 that's a *security* incident (a leak, a breach, a compromised key) has the *branch* (the `SECURITY/` docs are the *controls*; this is the *response*):

- **The *affected-tenants* scope is determined from the *audit*** (a cross-tenant leak: *which orgs* were touched? the audit's `access.denied_cross_tenant` + the successful-access rows answer it, `AUTHORIZATION §8` — the *investigation* is *data-driven*, not "we guess").
- **The *disclosure* is a *separate* decision from the *fix*** (a *tenant-breach* disclosure (a "your data was accessed" notice) is *legal + the customer's* call, not the on-call's; the on-call *contains* (rotate/revoke/disable), the *comms + legal* decide the *disclosure* (the `COMPLIANCE_CONSIDERATIONS.md` "the contractual/operational items" split — a disclosure is the *operational* side).
- **The *retention* of the *evidence* is preserved** (the PITR + the audit are *not* purged to "clean up" — the *investigation* + the *compliance* (a SOC 2 `CC7.2` "log the incident" evidence, `COMPLIANCE_CONSIDERATIONS §2`) need the *record* intact, `DATA_RETENTION.md`).

## 5. The *availability*-incident branch (the SEV-1s/SEVs that are *outages*)

- **The *queue* is the *decoupling*** (a `worker` outage: the `api` keeps accepting webhooks (a verify + enqueue), the *jobs* queue up (a *durable* queue, NFR-12 — a 30-min `worker` outage *loses no jobs*, the queue holds them). The *incident* is the *worker*, not the *ingress* — the *decoupling* is the *availability design* (`TRD §18`, `PERFORMANCE_SCALABILITY §4`)).
- **The *graceful-shutdown* + *re-drain*** (a `worker` crash/restart: the in-flight jobs *re-queue* (the 60 s budget, NFR-15), the durable queue *re-drains* (a *loss* of a *job* is *impossible* by design, only a *re-run* (the idempotency key, NFR-13)).
- **The *provider outage* is a *degradation*, not a *SEV-1*** (a provider down: the reviews are *partial* (the deterministic findings publish, the AI is absent), the *pipeline* is *not* down (ADR-005) — a *provider* SEV-2 is a *degradation* (a "reviews are degraded" status), *not* a "the product is down" SEV-1. The *total-outage* SEV-1 is a *platform* failure (Postgres loss, the *whole* pipeline, not a *provider*).

## 6. The *communication* rules (the SEV-1's "don't make it worse")

- **The status page is the *source*** (a SEV-1's status page is *live* (an "investigating / identified / monitoring / resolved" state) + a *timeline* + a *customer-facing summary*). A SEV-1 that has *no* status page update is a *comms* incident on top of the *technical* one.
- **The *customer email* (a SEV-1)** is *specific* (what, when, what's affected, what we did, what's next + a *contact*), *not* a template (a "we're looking into it" with no substance is *worse* than silence).
- **The *blameless* post-incident** (the *system* cause + the *system* fix, the *actions* with owners + due dates) is a *published* artifact (a *separate*, *blameless* doc, *not* the *comms* doc — the *blameless* post-mortem is *internal*, the *customer* comms is *specific + forward-looking*). A post-incident that *names a person* as the cause is *not* blameless (it's a *finding* that the *system* let a person be the *only* control — the *fix* is a *system* gate).

## 7. The *drills* (the incident response is *practiced*, not just documented)

| Drill | Cadence | What it proves |
| --- | --- | --- |
| **The SEV-1 page + assemble** (a *game-day*: a simulated page, the IC + handler + comms in a war-room, a *timed* containment) | Quarterly | The *named roles* actually show up (the on-call rotation is *staffed*, not a gap); the *contain* (a rotate/rollback) is *drilled* (a "we know how to rotate" claim is *proven*, not assumed) |
| **The *restore* drill** (a `ops-backup-*` restore, `BACKUP_RESTORE.md §4` — a *real* PITR-to-a-new-instance + a *read* against it) | A rotation (7-d, one per dump) | The "can we restore?" answer is *current* (a 30-day-old "we think we can" is *not* a drill, it's a *hope*) |
| **The *queue re-drain* drill** (a Redis loss → the queues re-drain, `BACKUP_RESTORE §3.3`'s queue case) | Quarterly | The *re-runnable* Redis surface (a queue loss is a *degradation*, not a *loss*, NFR-13) is *proven* |
| **The *provider-outage* drill** (a *simulated* provider-down → the *partial*-review degradation + the *bounded* retry + the *fallback* (a one-switch), `AI_SYSTEM_DESIGN §5`) | Quarterly | A provider SEV-2 is a *degradation* (not a SEV-1) — the *fail-soft* path is *drilled* (the "deterministic findings still publish" claim is *proven*) |

## 8. The *post-incident* → the *system fix* (the incident is a *test gap*, not a *person gap*)

Every SEV-1/SEV-2's post-incident produces *named system fixes* that are *tracked to closure* (a risk-register entry, `IMPLEMENTATION/RISK_REGISTER.md`, with an owner + a due date + the *verification test* that proves the fix). A post-incident that *only* says "we'll be more careful" is *incomplete* (the *system* fix is the *gate / the test / the invariant* that makes the *class* of incident *un-possible*, `RELEASE_CRITERIA §1`'s "a regression blocks the release" applied *prospectively*).

The cross-reference: **a SEV-1 that *could have been caught by a release gate that isn't there* is a *gate gap*** (a "we should have had a test for this" action is a *new* test in the suite — the `ST-*` / `IT-*` / the benchmark gate — not a "human more careful" action). The incident-response *feeds back into* the test suites (`SECURITY_TEST_PLAN §5` "on a provider/model/prompt change, the full benchmark + injection suite re-run" is the *pre*-incident control; the post-incident adds the *missing* test).
