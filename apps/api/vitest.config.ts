import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vercode/api",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
