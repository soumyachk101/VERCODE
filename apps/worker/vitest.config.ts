import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vercode/worker",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});
