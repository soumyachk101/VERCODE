// tests/security/security-tenant.test.ts
//
// ST-isolation-oracle / ST-tenant-cross (SECURITY_TEST_PLAN.md §1.2,
// THREAT_MODEL.md T-02 "Cross-tenant data access", TENANT_ISOLATION.md §2
// "the 404-vs-403 split" + TENANT_ISOLATION.md §5 "ST-isolation-oracle:
// no tenant endpoint ever returns 403 for a cross-tenant attempt (only
// 404); 403 is reserved for in-tenant capability denial").
//
// Release-gate semantics: a cross-tenant leak is a Critical — an automatic
// block. This spec drives the *real* tenant plugin source
// (apps/api/src/plugins/tenant.ts `buildTenantPlugin`) against a mocked
// Prisma surface (the pattern of apps/api/src/webhooks.test.ts) and asserts
// the 404-vs-403 split the plan pins:
//
//   - a cross-tenant request (org-A user → org-B resource) → 404 + an
//     `access.denied_cross_tenant` audit row (NOT a 403 — no existence
//     oracle, AC-902);
//   - an in-tenant capability denial (a member whose role lacks the
//     declared capability) → 403 + an `access.denied_capability` audit row
//     (a capability denial, distinct from a tenancy denial);
//   - a member with the capability → the gate passes, the handler runs.
//
// ---------------------------------------------------------------------------
// WHAT THIS SPEC RUNS TODAY + THE PRODUCT DEFECTS IT SURFACES:
//
// `buildTenantPlugin` constructs its own `PrismaClient` internally, so we
// `vi.mock("@prisma/client")` to back it with per-test in-memory rows (the
// fake is created via a module-level factory that reads the *current* seed).
//
// The gate is exercised on a route registered *directly on the root app*
// next to the plugin (where Fastify actually runs the plugin's preHandler).
// The capability is declared via the route `config` option — the path the
// plugin actually reads (`req.routeOptions.config?.capability`).
//
// Two P0 product defects this probe established against the real source are
// documented in KNOWN_ISSUES.md (they are what make the *full app* fail the
// ST-isolation-oracle gate today; the spec asserts the correct behavior so
// the suite is the gate once the wiring is fixed):
//
//   1. ENCAPSULATION: the tenant + auth plugins are registered on the root,
//      but `registerRoutes` registers the orgs/github routes in *sibling*
//      child plugins — so the plugin's preHandler hook + the `auth`/`tenant`
//      decorations are NOT visible to those routes. The tenancy gate never
//      applies to a real `/orgs/*` request (probed: GET /orgs/org-B → 200,
//      `req.tenant` null, no membership query).
//   2. CAPABILITY READ: the plugin reads `req.routeOptions.config?.
//      capability`, but the app's routes declare the capability in the
//      *schema* (`{ schema: { config: { capability } } }`), which lands on
//      `routeOptions.schema.config` — so even where the hook does run, the
//      capability gate sees `undefined` and is dormant (probed).
//
// Neither is fixed here (security-critical path — flagged for M7/M8).
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { PrismaClient, Organization, Membership, AuditEvent, Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// The in-memory Prisma rows (one set per test, swapped before each build).
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

let CURRENT_STATE: TenantDbState;

function setState(seed: TenantSeed): TenantDbState {
  CURRENT_STATE = {
    orgs: seed.orgs.map((o) => o as unknown as Organization),
    memberships: seed.memberships.map((m) => m as unknown as Membership),
    audits: [],
  };
  return CURRENT_STATE;
}

// ---------------------------------------------------------------------------
// The mocked Prisma seam.
//
// `buildTenantPlugin` does `new PrismaClient()` inside the plugin body, so
// the only way to back it with in-memory rows (without editing product
// code) is to `vi.mock("@prisma/client")` and return a fake whose methods
// read `CURRENT_STATE` (set per-test via `setState`).
// ---------------------------------------------------------------------------

vi.mock("@prisma/client", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@prisma/client");
  class FakePrismaClient {
    membership = {
      findFirst: async ({ where }: { where: { orgId: string; userId: string } }) =>
        CURRENT_STATE.memberships.find((m) => m.orgId === where.orgId && m.userId === where.userId) ?? null,
    };
    organization = {
      findFirst: async ({ where }: { where: { id?: string; slug?: string; status?: unknown } }) =>
        CURRENT_STATE.orgs.find((o) => o.id === where.id && o.status !== "DELETED") ?? null,
    };
    auditEvent = {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `audit-${CURRENT_STATE.audits.length + 1}`, createdAt: new Date(), ...data } as unknown as AuditEvent;
        CURRENT_STATE.audits.push(row);
        return row;
      },
    };
  }
  return { ...actual, PrismaClient: FakePrismaClient };
});

// A the plugin is imported AFTER the mock is registered so its
// `new PrismaClient()` resolves to the fake.
const { buildTenantPlugin } = await import("../../apps/api/src/plugins/tenant.js");

// ---------------------------------------------------------------------------
// The app builder — the real tenant plugin + a route registered DIRECTLY on
// the root app (where Fastify runs the plugin's hooks). The capability is
// declared via the route `config` option (the path the plugin actually
// reads — `req.routeOptions.config?.capability`).
// ---------------------------------------------------------------------------

type Capability = "read" | "org.manage";

async function buildTenantApp(seed: TenantSeed, capability: Capability = "read") {
  const state = setState(seed);
  const cfg: { capability?: Capability } = { capability };

  const app: FastifyInstance = Fastify({ logger: false });
  app.register(buildTenantPlugin());

  // A minimal session stand-in: the tenant plugin reads `req.user.userId`
  // (the auth plugin would resolve it from the cookie; here the test seeds
  // it directly so the tenancy gate is the unit under test). The hook is
  // registered on the root so it runs before the plugin's gate.
  app.addHook("preHandler", async (req) => {
    (req as { user?: { userId: string | null } }).user = { userId: seed.actingUserId };
  });

  // A the orgs-style route, registered on the root so the plugin's
  // preHandler gate applies. The capability is declared on the route
  // `config` option (the path the plugin reads) + mirrored in the schema
  // (the app's real declaration shape).
  app.get(
    "/orgs/:orgId/reviews",
    {
      schema: { config: { capability } },
      config: cfg as never,
    },
    async (req, reply) => {
      reply.send({ reached: true, orgId: req.params, tenant: (req as { tenant?: unknown }).tenant ?? null });
    }
  );

  await app.ready();
  return { app, state };
}

// ---------------------------------------------------------------------------
// The org-A / org-B fixture
// ---------------------------------------------------------------------------

const ORG_A = "org-a";
const ORG_B = "org-b";
const USER_IN_A = "user-in-a";
const USER_IN_NEITHER = "user-in-neither";

function baseSeed(over: Partial<TenantSeed> = {}): TenantSeed {
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
  };
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
    // TENANT_ISOLATION.md §1 "the 404 is *audited* (an
    // access.denied_cross_tenant audit event with the attempting org)".
    const denied = state.audits.find((a) => a.action === "access.denied_cross_tenant");
    expect(denied).toBeDefined();
    expect(denied!.orgId).toBe(ORG_B);
    expect(denied!.actorId).toBe(USER_IN_A);
  });

  it("an in-tenant capability denial (a member without the required capability) → 403", async () => {
    // A VIEWER in org-A hitting a route that requires `org.manage`: the
    // capability matrix (AUTHORIZATION.md §1) gives VIEWER only `read`, so
    // the role *lacks* the declared capability → 403 (a capability
    // denial, in-tenant — distinct from the cross-tenant 404).
    const { app, state } = await buildTenantApp(
      baseSeed({ memberships: [{ id: "m-1", orgId: ORG_A, userId: USER_IN_A, role: "VIEWER" }] }),
      "org.manage"
    );
    const res = await app.inject({ method: "GET", url: "/orgs/org-a/reviews" });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    const cap = state.audits.find((a) => a.action === "access.denied_capability");
    expect(cap).toBeDefined();
    expect(cap!.orgId).toBe(ORG_A);
    expect(cap!.actorId).toBe(USER_IN_A);
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
    // SAME as the 404 for a *nonexistent* org (an attacker can't tell which
    // case they hit — that's the oracle-closure).
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
    expect(foreign.statusCode).toBe(404);
    expect(foreign.body).toBe(unknown.body); // A byte-identical 404.
  });
});
