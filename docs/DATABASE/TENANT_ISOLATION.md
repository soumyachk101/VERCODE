# VERCODE — Tenant Isolation (Database)

The database-level enforcement of FR-105 / NFR-07: no tenant row is ever reachable without an `org_id` binding.

## 1. The rule, stated three ways

1. **Schema:** every tenant-owned table carries `org_id`; its leading composite indexes begin with `org_id` (`INDEXING_STRATEGY.md` §1).
2. **Access:** the tenant repository layer (`packages/database`) exposes *only* `orgId`-scoped methods; a method that returns rows without an `org_id` filter does not exist in the API surface.
3. **Behavior:** a cross-org request returns **404, not 403** (no existence oracle — `AC-902`), and the 404 is *audited* (`webhook.rejected` / `access.denied_cross_tenant` audit event with the attempting org).

## 2. The layers that enforce it

| Layer | What it enforces | Fails how |
| --- | --- | --- |
| **AuthN middleware** | Resolves the session → `userId`; 401 if none | A request without a session can't even reach tenancy |
| **Tenant middleware** | Resolves the requested `org_id`; verifies the session's user is a *member* of it (via `memberships`); 404 if not a member | A user hitting another org's resource gets 404 |
| **Capability middleware** | Resolves the role's capabilities; 403 if the action isn't in the set | A Viewer hitting a mutating route gets 403 (this is a *capability* denial, distinct from a tenancy denial) |
| **Repository** | Every method takes `orgId` first and *always* includes it in the `where` clause; a missing `orgId` is a 500 (programming error), never "return all" | The last line of defense — even a bug in the middleware can't leak a cross-tenant read |

The **404-vs-403 split** matters: tenancy failures (wrong org) are 404 (don't reveal the resource exists in another org); capability failures (right org, wrong role) are 403. `ST-isolation-oracle` asserts the split holds for every tenant endpoint.

## 3. The cache layer is org-scoped too

The Redis diff cache key is `org:{orgId}:repo:{repoId}:diff:{sha}` (`CONTEXT_RETRIEVAL.md` §4, TRD §8). A cache read is *namespaced by org*, so a cache hit can never serve another org's diff. The cache *write* carries the same org binding the read requires. A cache key that omits the org prefix is a defect the cache-client type makes hard to write (the key builder takes `orgId` as its first arg).

## 4. The worker re-reads, never trusts

A job payload carries only a `jobId` (`SERVICE_BOUNDARIES` must-never-cross #5). The worker's first act is to load the durable state (org, quota, settings, repo connection) from Postgres *by the stored `org_id`* — it does not re-derive tenancy from the payload. A corrupted or forged payload cannot point the worker at another org's data, because the pointer (`jobId`) resolves to a row whose `org_id` is authoritative.

## 5. Verification (the suite that must pass every release)

| Test | Assertion |
| --- | --- |
| `IT-tenant-01` | Org A's token requesting org B's `/orgs/:b/reviews` → 404 (no leak of B's existence to A's user) |
| `IT-tenant-02` | A Viewer in org A hitting a mutating org-A route → 403 (capability), distinct from `IT-tenant-01`'s 404 (tenancy) |
| `IT-tenant-03` | A user who is a member of *neither* org, hitting org B → 404 |
| `IT-tenant-04` | The `EXPLAIN` on every tenant fixture query shows the leading `org_id` index used; no seq-scan on a tenant table |
| `IT-tenant-05` | A Redis cache *write* for org A is unreadable under an org B key (the key namespaces them) |
| `ST-isolation-oracle` | No tenant endpoint ever returns 403 for a *cross-tenant* attempt (only 404); 403 is reserved for in-tenant capability denial |

The suite is **re-run on every schema change** (a new tenant table that forgot its `org_id` column or leading index fails `IT-tenant-04`'s plan check) — this is what makes tenancy a *release gate*, not a one-time review.

## 6. Deletion is tenant-scoped too

An org deletion cascades *its* tenant rows (`DATABASE_DESIGN.md` §3, `onDelete: Cascade` on the tenant children of `Organization`) — it does not touch another org's rows, because the cascade is rooted at the specific org. The hard-purge (`retention_jobs`) is org-scoped by the same key.
