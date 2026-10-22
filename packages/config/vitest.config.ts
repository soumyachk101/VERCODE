import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vercode/config",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
