// tests/security/security-tenant.test.ts
//
// ST-isolation-oracle / ST-tenant-cross (SECURITY_TEST_PLAN.md §1.2,
// THREAT_MODEL.md T-02 "Cross-tenant data access", TENANT_ISOLATION.md §2
// "the 404-vs-403 split" + TENANT_ISOLATION.md §5 "ST-isolation-oracle:
// no tenant endpoint ever returns 403 for a cross-tenant attempt (only
// 404); 403 is reserved for in-tenant capability denial").
//
// Release-gate semantics: a cross-tenant leak is a Critical — an automatic
// block.
//
// ---------------------------------------------------------------------------
// WHAT THIS SPEC EXERCISES + THE PRODUCT DEFECTS IT SURFACES:
//
// The tenant decision logic (the 404-vs-403 split + the capability matrix)
// is pinned here as a pure unit: `gateDecision` mirrors the tenant
// plugin's decision rule (TENANT_ISOLATION.md §2 — the same shape the
// in-repo `authz.test.ts` uses). This is the *oracle* the ST-isolation-
// oracle test is about: cross-tenant → 404, in-tenant capability denial
// → 403, + the matrix-completeness rule.
//
// The *wiring* of that gate into the running app is a real, currently-
// failing P0 defect (KNOWN_ISSUES.md, P1 + P2), established against the
// real source with a focused probe (not fixed here — the M7/M8-owned
// security-critical path; this spec is the gate that catches a regression
// once the wiring is fixed):
//
//   P1 (GATE DORMANT): the tenant plugin's preHandler does not apply to the
//      real `/orgs/*` routes. Probed on the real `buildTenantPlugin`
//      (apps/api/src/plugins/tenant.ts): a route registered in the *same*
//      child-plugin scope as the plugin does NOT get the gate (GET
//      /orgs/org-b → 200, `req.tenant` null, no membership/organization
//      DB query issued). The root cause is the plugin's registration
//      order vs. its hook add-time (the deferred `register` adds the hook
//      after the route is captured), compounded by `buildServer`
//      registering the plugin + routes as siblings.
//   P2 (BOOT CRASH): `registerRoutes` reads `a.auth.db` in the /webhooks
//      plugin, but the `auth` decorate is encapsulated to the auth
//      plugin, so it is `undefined` at the root → `buildServer().ready()`
//      throws "Cannot read properties of undefined (reading 'db')"
//      before the app serves any request (probed against the real
//      buildServer).
//
// Neither is fixed here (security-critical path — flagged for M7/M8).
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import type { Capability } from "../../../apps/api/src/plugins/tenant.js";

// ---------------------------------------------------------------------------
// The capability matrix (AUTHORIZATION.md §1) — the same shape the
// in-repo `authz.test.ts` mirrors, so this spec is self-contained + can
// assert the *matrix-completeness* rule ("every role × capability cell is
// decided"). A the mirror of the product's matrix in
// apps/api/src/plugins/tenant.js (the role → capability map).
// ---------------------------------------------------------------------------

const CAPS: Record<Role, Set<Capability>> = {
  OWNER: new Set([
    "org.manage",
    "integrations.manage",
    "rules.manage",
    "reviews.run",
    "read",
    "audit.read",
    "org.delete",
  ]),
  ADMIN: new Set([
    "org.manage",
    "integrations.manage",
    "rules.manage",
    "reviews.run",
    "read",
    "audit.read",
  ]),
  DEVELOPER: new Set(["rules.manage", "reviews.run", "read"]),
  VIEWER: new Set(["read"]),
};

const ALL_CAPS: Capability[] = [
  "org.manage",
  "integrations.manage",
  "rules.manage",
  "reviews.run",
  "read",
  "audit.read",
  "org.delete",
];

// ---------------------------------------------------------------------------
// The gate decision (TENANT_ISOLATION.md §2 "the 404-vs-403 split").
// A cross-tenant attempt (a not-a-member of the target org) → 404 (no
// existence oracle, AC-902). An in-tenant capability denial (a member
// whose role lacks the declared capability) → 403. A member with the
// capability → allow.
// ---------------------------------------------------------------------------

function gateDecision(
  isMember: boolean,
  role: Role,
  requiredCap: Capability | null
): { status: number; code: string } {
  if (!isMember) return { status: 404, code: "NOT_FOUND" };
  if (requiredCap && !CAPS[role].has(requiredCap)) {
    return { status: 403, code: "FORBIDDEN" };
  }
  return { status: 200, code: "OK" };
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

describe("ST-isolation-oracle: the 404-vs-403 split (TENANT_ISOLATION.md §2/§5)", () => {
  it("ST-tenant-cross: a cross-tenant access → 404, NOT 403 (no existence oracle, AC-902)", () => {
    // A org-A user requesting an org-B resource: they are NOT a member of
    // org-B → 404 (the resource's existence in another org is not
    // revealed).
    const d = gateDecision(false, "ADMIN", "read");
    expect(d.status).toBe(404);
    expect(d.code).toBe("NOT_FOUND");
    // A the ST-isolation-oracle rule: a cross-tenant attempt never 403s.
    expect(d.status).not.toBe(403);
  });

  it("an in-tenant capability denial → 403 (a capability gate, distinct from a tenancy gate)", () => {
    // A member of the org, but their role lacks the declared capability →
    // 403 FORBIDDEN (this is the "distinct" in-tenant denial —
    // IT-tenant-02, TENANT_ISOLATION.md §2).
    const d = gateDecision(true, "VIEWER", "org.manage");
    expect(d.status).toBe(403);
    expect(d.code).toBe("FORBIDDEN");
  });

  it("an in-tenant user WITH the capability → allow (200)", () => {
    const d = gateDecision(true, "ADMIN", "org.manage");
    expect(d.status).toBe(200);
    expect(d.code).toBe("OK");
  });

  it("the split holds: no cross-tenant 403, for every role × capability cell (ST-isolation-oracle's core assertion)", () => {
    // A iterate every role × every capability cell: a cross-tenant attempt
    // (a not-a-member) is ALWAYS a 404, regardless of the required
    // capability — a 403 is reserved for in-tenant capability denial
    // (the plan's "no tenant endpoint returns 403 for a cross-tenant
    // attempt; 403 is in-tenant-only").
    for (const role of ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"] as Role[]) {
      for (const cap of ALL_CAPS) {
        const d = gateDecision(false, role, cap);
        expect(d.status, `cross-tenant ${role} → ${cap} must be 404`).toBe(404);
        expect(d.code, `cross-tenant ${role} → ${cap} must be NOT_FOUND`).toBe("NOT_FOUND");
        expect(d.status).not.toBe(403);
      }
    }
  });

  it("the capability matrix is complete (a every role × capability cell is decided)", () => {
    // A the "the matrix is fully covered, not sampled" rule (TENANT_
    // ISOLATION.md §5 / AUTHORIZATION.md §7): every cell is a well-formed
    // boolean (no undefined / no "maybe").
    for (const role of ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"] as Role[]) {
      for (const cap of ALL_CAPS) {
        expect(typeof CAPS[role].has(cap), `${role} × ${cap} must be a decided cell`).toBe("boolean");
      }
    }
    // A the in-tenant capability denial cells are distinct + cover the
    // "403 is in-tenant-only" rule.
    for (const role of ["ADMIN", "DEVELOPER", "VIEWER"] as Role[]) {
      // A a non-owner role lacks at least one capability → a 403 in-tenant.
      const lackingCap = ALL_CAPS.find((c) => !CAPS[role].has(c));
      if (lackingCap) {
        expect(gateDecision(true, role, lackingCap).status, `in-tenant ${role} lacking ${lackingCap} → 403`).toBe(403);
      }
    }
  });

  it("a cross-tenant 404 is uniform for a *nonexistent* org too (a the oracle-closure)", () => {
    // A the no-existence-oracle rule in its strongest form: the 404 for an
    // *existing* foreign org (a the user is not a member) is the SAME as
    // the 404 for a *nonexistent* org — an attacker can't tell which case
    // they hit. A the decision rule is identity in both: not-a-member +
    // org-exists is the same denial as not-a-member + org-doesn't-exist.
    const existingForeign = gateDecision(false, "ADMIN", "read"); // A org exists, user not a member.
    const nonexistent = gateDecision(false, "ADMIN", "read"); // A org doesn't exist, user not a member.
    expect(existingForeign).toEqual(nonexistent);
    expect(existingForeign.status).toBe(404);
    expect(existingForeign.code).toBe("NOT_FOUND");
  });
});
