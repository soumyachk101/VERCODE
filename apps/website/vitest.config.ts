import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@vercode/website",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});
