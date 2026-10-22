import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vercode/github",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
