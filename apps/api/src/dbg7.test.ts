import { describe, it, expect } from "vitest";
import { mockPrisma } from "./webhooks.test.js";

describe("dbg7", () => {
  it("calls mockPrisma findUnique directly", async () => {
    const { db, state } = mockPrisma({});
    const res = await db.webhookDelivery.findUnique({ where: { deliveryId: "d1" } });
    console.log("DIRECT findUnique:", res, "state type:", typeof state);
    expect(res).toBeNull();
  });
});
