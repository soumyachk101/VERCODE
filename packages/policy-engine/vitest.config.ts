import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vercode/policy-engine",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
