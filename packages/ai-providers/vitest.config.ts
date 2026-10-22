import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@vercode/ai-providers",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
