import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vercode/static-analysis",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
