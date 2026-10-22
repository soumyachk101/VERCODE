import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vercode/diff-engine",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
