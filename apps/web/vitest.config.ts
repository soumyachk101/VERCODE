import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    name: "@vercode/web",
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    // Charts render into SVG; recharts warns without a stable container.
    setupFiles: ["./vitest.setup.ts"],
  },
});
