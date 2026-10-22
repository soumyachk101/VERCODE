import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vercode/observability",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
