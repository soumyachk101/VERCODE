import { defineConfig } from "vitest/config";

// The contracts package's unit tests (the plans, the findings, the schemas —
// all pure, no I/O, so no testcontainers / no mocks needed here,
// UNIT_TEST_PLAN.md §2/§8 "the pure packages have a coverage gate").
export default defineConfig({
  test: {
    name: "@vercode/contracts",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
