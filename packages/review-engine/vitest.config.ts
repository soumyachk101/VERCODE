import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vercode/review-engine",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
