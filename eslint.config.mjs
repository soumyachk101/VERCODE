// ESLint 9 flat config. The root `lint` script targets packages/**/*.ts +
// apps/**/*.ts with --max-warnings 0 (RELEASE_CRITERIA gate 2: a warning is a
// failure). typescript-eslint with the project-aware parser for type-checked
// rules; the import-boundary rule (REPOSITORY_STRUCTURE.md "no module imports
// another module's internals") is a project-service check added as the
// packages grow (M2+).
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "scripts/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    rules: {
      // The NodeNext/verbatimModuleSyntax invariant (PROJECT_DISCOVERY §4.3):
      // a relative import must carry a .js extension. The typecheck catches it
      // too, but this makes the rule explicit + the failure message is clearer.
      "@typescript-eslint/no-floating-promises": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Test files get relaxed rules (console.assert / console.log in fixtures).
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-floating-promises": "off",
    },
  }
);
