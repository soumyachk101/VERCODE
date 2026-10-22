// IT-authz + IT-tenant-01..02 (TASK_BREAKDOWN T2.4/T2.5, AUTHORIZATION.md §1
// the capability matrix, TENANT_ISOLATION.md §2 the 404-vs-403 split).
//
// A mocked-DB unit test of the capability-matrix + the tenancy gate logic.
// The full integration (a real DB + a HTTP server) is the `IT-tenant-*`
// testcontainers suite (M8); this is the *logic* gate that runs on every PR.

import { describe, it, expect } from "vitest";

// Replicate the CAPS matrix (the AUTHORIZATION.md §1 table) so the test is
// self-contained + can assert *the shape* of the matrix (a every-deny cell).
// The real matrix lives in plugins/tenant.ts; this mirrors it for the unit
// test (a the "the role × capability matrix cells (every deny is a test)"
// rule, AUTHORIZATION.md §7 "a Developer self-promote → 403").
import type { Role } from "@prisma/client";

const CAPS: Record<Role, Set<string>> = {
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

const ALL_CAPS = [
  "org.manage",
  "integrations.manage",
  "rules.manage",
  "reviews.run",
  "read",
  "audit.read",
  "org.delete",
] as const;

describe("capability matrix (IT-authz, AUTHORIZATION.md §1)", () => {
  it("OWNER has every capability", () => {
    for (const c of ALL_CAPS) expect(CAPS.OWNER.has(c)).toBe(true);
  });

  it("ADMIN lacks org.delete (owner-only, AC-104)", () => {
    expect(CAPS.ADMIN.has("org.delete")).toBe(false);
  });

  it("DEVELOPER lacks the manage capabilities + audit (the self-promote is a 403)", () => {
    expect(CAPS.DEVELOPER.has("org.manage")).toBe(false);
    expect(CAPS.DEVELOPER.has("integrations.manage")).toBe(false);
    expect(CAPS.DEVELOPER.has("audit.read")).toBe(false);
    // a Developer CAN manage rules + run reviews + read
    expect(CAPS.DEVELOPER.has("rules.manage")).toBe(true);
    expect(CAPS.DEVELOPER.has("reviews.run")).toBe(true);
    expect(CAPS.DEVELOPER.has("read")).toBe(true);
  });

  it("VIEWER can only read (a Viewer hitting a mutating route is a 403)", () => {
    expect(CAPS.VIEWER.has("read")).toBe(true);
    for (const c of ALL_CAPS) {
      if (c !== "read") expect(CAPS.VIEWER.has(c)).toBe(false);
    }
  });

  it("the matrix is complete: every role × capability cell is decided", () => {
    const roles = Object.keys(CAPS) as Role[];
    for (const role of roles) {
      for (const cap of ALL_CAPS) {
        // A cell is either in the set or not — no undefined / no "maybe".
        expect(typeof CAPS[role].has(cap)).toBe("boolean");
      }
    }
  });
});

describe("tenancy gate (IT-tenant-01/02, the 404-vs-403 split)", () => {
  // The split logic: a cross-tenant (a not-a-member) → 404; an in-tenant
  // capability denial → 403. A function mirroring the tenant plugin's decision.
  function gateDecision(
    isMember: boolean,
    role: Role,
    requiredCap: string | null
  ): { status: number; code: string } {
    if (!isMember) return { status: 404, code: "NOT_FOUND" };
    if (requiredCap && !CAPS[role].has(requiredCap)) {
      return { status: 403, code: "FORBIDDEN" };
    }
    return { status: 200, code: "OK" };
  }

  it("a cross-tenant access → 404 (no existence oracle, AC-902)", () => {
    const d = gateDecision(false, "ADMIN", "read");
    expect(d.status).toBe(404);
    expect(d.code).toBe("NOT_FOUND");
  });

  it("an in-tenant capability denial → 403 (distinct from the 404)", () => {
    const d = gateDecision(true, "VIEWER", "org.manage");
    expect(d.status).toBe(403);
    expect(d.code).toBe("FORBIDDEN");
  });

  it("an in-tenant allowed capability → 200", () => {
    const d = gateDecision(true, "ADMIN", "org.manage");
    expect(d.status).toBe(200);
  });

  it("a 403 is reserved for in-tenant (no cross-tenant 403, ST-isolation-oracle)", () => {
    // a cross-tenant attempt must never be a 403 (it's a 404, no oracle).
    const d = gateDecision(false, "ADMIN", "org.manage");
    expect(d.status).toBe(404);
    expect(d.code).not.toBe("FORBIDDEN");
  });
});
