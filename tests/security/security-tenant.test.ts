// tests/security/security-tenant.test.ts
//
// ST-isolation-oracle / ST-tenant-cross (SECURITY_TEST_PLAN.md §1.2,
// THREAT_MODEL.md T-02 "Cross-tenant data access", TENANT_ISOLATION.md §2
// "the 404-vs-403 split" + TENANT_ISOLATION.md §5 "ST-isolation-oracle:
// no tenant endpoint ever returns 403 for a cross-tenant attempt (only
// 404); 403 is reserved for in-tenant capability denial").
//
// Release-gate semantics: this spec is a P0 security gate — a cross-tenant
// leak is a Critical, an automatic block.
//
// ---------------------------------------------------------------------------
// WHAT THIS SPEC RUNS TODAY (against the code that exists):
//
//   The @vercode/api app's *decision logic* — the tenant plugin's
//   404-vs-403 split — is verified through the real plugin source
//   (apps/api/src/plugins/tenant.ts's `buildTenantPlugin`) driven against
//   a mocked Prisma surface (the pattern of apps/api/src/webhooks.test.ts):
//
//     - a cross-tenant request (org-A user, org-B resource) → the plugin's
//       preHandler 404s + writes the `access.denied_cross_tenant` audit row
//       (NOT a 403 — the no-existence-oracle rule, AC-902).
//     - an in-tenant capability denial (member of org A, role without the
//       required capability) → 403 + an `access.denied_capability` audit row
//       (capability denial is DISTINCT from tenancy denial).
//     - a member with the capability → passes the gate (the handler runs).
//
//   The tenant plugin is registered as a root-level plugin, so its
//   preHandler hook applies to routes registered in a root-level sibling
//   plugin (the orgs routes are registered from `registerRoutes`'s
//   `app.register(orgRoutes, { prefix: "/orgs" })` — a child context); we
//   mirror that topology here (a plugin-registered handler that reads
//   `req.user` / `req.tenant` + the route's declared capability).
//
//   The route-level HTTP assertions (a real cookie session against
//   `/orgs/{B}` → 404, in the FULL app) need the session resolution path
//   (the auth plugin's `db.session.findUnique` + `db.user.findUnique` mocks)
//   and the app factory `buildServer` — tracked as the next step below.
//
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { PrismaClient, Organization, Membership, AuditEvent, User, Role } from "@prisma/client";
import { buildTenantPlugin } from "../../apps/api/src/plugins/tenant.js";

// ---------------------------------------------------------------------------
// The mocked Prisma surface (the pattern from apps/api/src/webhooks.test.ts:
// an in-memory fake, no Postgres). We build exactly the rows the tenant
// plugin touches (membership, organization, auditEvent) + record the writes.
// ---------------------------------------------------------------------------

interface TenantSeed {
  orgs: Array<{ id: string; slug: string; status: string }>;
  memberships: Array<{ id: string; orgId: string; userId: string; role: Role }>;
  /** The acting user's id (what `req.user.userId` will be). */
  actingUserId: string;
}

interface TenantDbState {
  orgs: Organization[];
  memberships: Membership[];
  audits: AuditEvent[];
}

function mockTenantDb(seed: TenantSeed): { db: PrismaClient; state: TenantDbState } {
  const state: TenantDbState = {
    orgs: seed.orgs.map((o) => o as unknown as Organization),
    memberships: seed.memberships.map((m) => m as unknown as Membership),
    audits: [],
  };

  const db = {
    membership: {
      findFirst: async ({ where }: { where: { orgId: string; userId: string } }) =>
        state.memberships.find((m) => m.orgId === where.orgId && m.userId === where.userId) ?? null,
    },
    organization: {
      findFirst: async ({ where }: { where: { id?: string; slug?: string; status?: unknown } }) =>
        state.orgs.find((o) => o.id === where.id && o.status !== "DELETED") ?? null,
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `audit-${state.audits.length + 1}`, createdAt: new Date(), ...data } as unknown as AuditEvent;
        state.audits.push(row);
        return row;
      },
    },
  } as unknown as PrismaClient;

  return { db, state };
}

// ---------------------------------------------------------------------------
// The app builder — the real tenant plugin + a child-registered orgs-style
// route that mirrors `registerRoutes`'s topology (a plugin-registered
// handler under a prefix, reading `req.user` + the declared capability).
// ---------------------------------------------------------------------------

async function buildTenantApp(seed: TenantSeed) {
  const { db, state } = mockTenantDb(seed);

  // The plugin is registered on the root app; the orgs-style routes live in
  // a child plugin (a sibling) — the same topology `buildServer` uses.
  const app: FastifyInstance = Fastify({ logger: false });
  app.register(buildTenantPlugin());
  app.register(async (a: FastifyInstance) => {
    // A minimal session stand-in: the tenant plugin reads `req.user.userId`
    // (the auth plugin would resolve it from the cookie; here the test seeds
    // it directly so the tenancy gate is the unit under test).
    a.addHook("preHandler", async (req) => {
      (req as { user?: { userId: string | null } }).user = { userId: seed.actingUserId };
    });
    a.get(
      "/orgs/:orgId/reviews",
      { schema: { config: { capability: "read" } } },
      async (req, reply) => {
        reply.send({ reached: true, orgId: req.params, tenant: (req as { tenant?: unknown }).tenant ?? null });
      }
    );
  }, { prefix: "/" });

  await app.ready();
  return { app, state, db };
}

// ---------------------------------------------------------------------------
// The org-A / org-B fixture
// ---------------------------------------------------------------------------

const ORG_A = "org-a";
const ORG_B = "org-b";
const USER_IN_A = "user-in-a";
const USER_IN_NEITHER = "user-in-neither";

function baseSeed(over: Partial<TenantSeed> = {}) {
  return {
    orgs: [
      { id: ORG_A, slug: "acme", status: "ACTIVE" },
      { id: ORG_B, slug: "globex", status: "ACTIVE" },
    ],
    memberships: [
      { id: "m-1", orgId: ORG_A, userId: USER_IN_A, role: "ADMIN" },
      { id: "m-2", orgId: ORG_B, userId: "user-in-b", role: "OWNER" },
    ],
    actingUserId: USER_IN_A,
    ...over,
  } as TenantSeed;
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

describe("ST-isolation-oracle: the 404-vs-403 split (TENANT_ISOLATION.md §2/§5)", () => {
  it("ST-tenant-cross: a cross-tenant request (org-A user → org-B resource) → 404, NOT 403", async () => {
    const { app, state } = await buildTenantApp(baseSeed());
    const res = await app.inject({ method: "GET", url: "/orgs/org-b/reviews" });

    // The no-existence-oracle rule (AC-902): a cross-tenant access is a 404.
    // (The resource exists in org-B, but org-A's user gets the same 404 they
    // would for an unknown org — the *existence* is not revealed.)
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
    // A 404, NOT a 403 (the ST-isolation-oracle gate: 403 is in-tenant-only).
    expect(res.statusCode).not.toBe(403);

    // The audit row (a cross-tenant denial is recorded + investigable):
    // TENANT_ISOLATION.md §1 "the 404 is *audited* (a
    // access.denied_cross_tenant audit event with the attempting org)".
    const denied = state.audits.find((a) => a.action === "access.denied_cross_tenant");
    expect(denied).toBeDefined();
    expect(denied!.orgId).toBe(ORG_B);
    expect(denied!.actorId).toBe(USER_IN_A);
  });

  it("an in-tenant capability denial (a member without the required capability) → 403", async () => {
    // A VIEWER in org-A hitting a route that requires `reviews.run`... the
    // capability matrix (AUTHORIZATION.md §1): VIEWER has ONLY `read`, so
    // any mutating / run route is a 403 (a capability denial, in-tenant).
    const { app, state } = await buildTenantApp(
      baseSeed({
        memberships: [
          { id: "m-1", orgId: ORG_A, userId: USER_IN_A, role: "VIEWER" },
        ],
      })
    );
    const res = await app.inject({ method: "GET", url: "/orgs/org-a/reviews" });

    // In-tenant + a capability the role lacks → 403 FORBIDDEN (this is the
    // "distinct" denial — a capability gate, not a tenancy gate).
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    const cap = state.audits.find((a) => a.action === "access.denied_capability");
    expect(cap).toBeDefined();
    expect(cap!.orgId).toBe(ORG_A);
    // The audit row records the requested capability + the role.
    expect((cap!.meta as unknown as { requested: string }).requested).toBe("read");
  });

  it("an in-tenant user WITH the capability → the gate passes (the handler runs)", async () => {
    // An ADMIN in org-A hitting a `read`-gated route: the capability is in
    // the matrix (ADMIN has `read`), the tenancy is in-org → 200 + the
    // handler executes (the tenant context is resolved + attached).
    const { app, state } = await buildTenantApp(baseSeed());
    const res = await app.inject({ method: "GET", url: "/orgs/org-a/reviews" });
    expect(res.statusCode).toBe(200);
    expect(res.json().reached).toBe(true);
    expect(res.json().tenant).not.toBeNull();
    // No denial audit row was written (a clean pass).
    expect(state.audits.length).toBe(0);
  });

  it("the split holds: no cross-tenant 403 (ST-isolation-oracle's core assertion)", async () => {
    // The oracle's *rule*: for ANY user who is not a member of the target
    // org, a request to that org's resource is a 404 — never a 403. This
    // iterates the two denial cells the plan names:
    //   - a member of org-A requesting org-B → 404
    //   - a member of neither org requesting org-B → 404
    // Both are cross-tenant, both must 404 (no 403, no "it exists" hint).
    for (const actingUserId of [USER_IN_A, USER_IN_NEITHER]) {
      const { app } = await buildTenantApp(baseSeed({ actingUserId }));
      const res = await app.inject({ method: "GET", url: "/orgs/org-b/reviews" });
      expect(res.statusCode, `${actingUserId} → org-B should be 404`).toBe(404);
      expect(res.statusCode).not.toBe(403);
    }
  });

  it("a cross-tenant 404 carries a uniform body (no org-existence signal)", async () => {
    // A no-oracle check: the 404 body for an *existing* foreign org is the
    // SAME shape as the 404 for a *nonexistent* org (an attacker can't tell
    // which case they hit — that's the oracle-closure).
    const { app: existingApp } = await buildTenantApp(baseSeed());
    const foreign = await existingApp.inject({ method: "GET", url: "/orgs/org-b/reviews" });

    const { app: unknownApp } = await buildTenantApp(
      baseSeed({
        // org-B is not in the seed → a genuinely-unknown org.
        orgs: [{ id: ORG_A, slug: "acme", status: "ACTIVE" }],
      })
    );
    const unknown = await unknownApp.inject({ method: "GET", url: "/orgs/org-b/reviews" });

    expect(unknown.statusCode).toBe(404);
    expect(foreign.body).toBe(unknown.body); // A byte-identical 404.
  });
});
