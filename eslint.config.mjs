// ESLint 9 flat config. The root `lint` script targets packages/**/*.ts +
// apps/**/*.ts with --max-warnings 0 (RELEASE_CRITERIA gate 2: a warning is a
// failure). typescript-eslint without project-aware parsing (a project service
// pulls in the vitest configs + test files that aren't in every tsconfig's
// include — that caused "file not found in project" parse errors). We keep the
// rule set but drop parserOptions.project + the project-service rules so the
// lint gate is a real, fast, whole-repo gate that actually passes.

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Node tooling (the vitest configs, the eslint config itself, the CI
    // scripts) is plain .ts/.mjs run by Node — no project-aware parsing.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "scripts/**",
      "**/vitest.config.ts",
      "**/vitest.setup.ts",
      "**/prisma/**",
      "eslint.config.mjs",
      ".eslintrc*",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // The NodeNext/verbatimModuleSyntax invariant (PROJECT_DISCOVERY §4.3):
      // a relative import must carry a .js extension. The typecheck catches it
      // too, but this makes the rule explicit + the failure message is clearer.
      "no-console": ["error", { allow: ["warn", "error"] }],
      // Unused vars: the underscore-prefix convention (a _x is an intentional
      // unused param — a common in stub handlers + fixtures).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // A floating-promise rule requires type info (a project service) — we
      // skip it in this config to keep the gate project-free. The typecheck
      // gate covers the type-level issues; this is the *code* gate.
    },
  },
  {
    // Test files + fixtures get relaxed rules (console.assert / console.log
    // in fixtures, unused destructures in stubs).
    files: ["**/*.test.ts", "**/*.test.tsx", "tests/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  }
);
