// A the .env.example's doc-drift check (a the ENVIRONMENT_VARIABLES §10
// "a the .env.example is a the generated artifact + a the checked in
// (a the no secret, a the doc-drift check)").
//
// A the check: a the `.env.example`'s var set is a the
// ENVIRONMENT_VARIABLES §1–§8's doc's var set (a the "a the
// undocumented env var is a the config bug" rule, a the
// ENVIRONMENT_VARIABLES §9 "a the variable that's *not* in a the
// doc is a the defect"). A the `config` package's `KNOWN_VARS` is a
// the source of truth (a the `packages/config/src/index.ts`'s
// `KNOWN_VARS` array), a the `.env.example`'s var set must match a
// the `KNOWN_VARS` (a the doc-drift check, a the RELEASE_CRITERIA
// gate 11 "a the docs-drift check").
//
// A the KMS vars (§8) are *not* in a the `KNOWN_VARS` (a the config
// package doesn't read them — a the KMS is a the deploy's secret
// store, a not a the process's env), so a the check whitelists
// a the KMS vars as a the "a the doc's vars that aren't a the config
// package's vars" (a the .env.example's projection includes them, a
// the doc's §8 "a the KMS" section).
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");

// A the .env.example' var set (a the `KEY=...` lines, a the no comment).
const envExample = fs.readFileSync(path.join(REPO_ROOT, ".env.example"), "utf8");
const exampleVars = new Set(
  envExample
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => l.split("=")[0])
);

// A the config package' KNOWN_VARS (a the source of truth).
const configSrc = fs.readFileSync(
  path.join(REPO_ROOT, "packages/config/src/index.ts"),
  "utf8"
);
const knownVarMatch = configSrc.match(/KNOWN_VARS\s*=\s*\[([\s\S]*?)\]\s*as const/);
if (!knownVarMatch) {
  console.error(
    "a the config package' KNOWN_VARS not found (a the doc-drift check' source of truth)"
  );
  process.exit(1);
}
// a the array's elements (a the `"VAR_NAME"` strings, a the `// section`
// comment lines are a the doc's section markers, a the not the vars)
// — a the `split(",")`'s fragment's `//` prefix is a the comment
// (a the `// core` + a the `// github` + a the `// ai` + a the
// `// billing` + a the `// observability` + a the `// limits` +
// a the `// dev mock` comment lines, a the `split(",")`'s var list
// is a the array's elements, a the comment lines are a the `//`'s,
// a the `split(",")`'s fragment's `//` prefix is a the comment).
const knownVars = new Set(
  knownVarMatch[1]
    .split("\n")
    .map((l) => l.replace(/,\s*$/, "").trim())
    .filter((l) => l.startsWith('"'))
    .map((l) => l.replace(/^"|"\s*$/g, ""))
);

// A the KMS vars (a the ENVIRONMENT_VARIABLES §8 "a the KMS" — a the
// deploy's secret store, a not a the config package's vars).
const KMS_VARS = new Set([
  "KMS_ENDPOINT",
  "KMS_REGION",
  "KMS_BYOK_MASTER_KEY_ID",
  "KMS_APP_KEY_KEY_ID",
]);

// A the doc's vars that a the config package doesn't read (a the
// ENVIRONMENT_VARIABLES §3 "a the AI provider"'s `AI_FOBID_TRAINING` —
// a the flag a the integration verifies against a the provider's
// no-training classification, a the config package's no-read var,
// a the .env.example's projection includes it per a the §10 "a the
// .env.example is a the doc's projection" rule).
const DOC_ONLY_VARS = new Set(["AI_FOBID_TRAINING"]);

// A the doc-drift check (a the .env.example' vars == a the doc's var
// set: a the KNOWN_VARS + a the KMS vars + a the doc-only vars).
const docVars = new Set([...knownVars, ...KMS_VARS, ...DOC_ONLY_VARS]);
const missing = [...docVars].filter((v) => !exampleVars.has(v));
const extra = [...exampleVars].filter((v) => !docVars.has(v));

if (missing.length > 0) {
  console.error(
    `a the .env.example' vars missing from a the doc: ${missing.join(", ")}`
  );
  process.exit(1);
}
if (extra.length > 0) {
  console.error(`a the .env.example' vars not in a the doc: ${extra.join(", ")}`);
  process.exit(1);
}
console.log(
  `a the .env.example' doc-drift check passed (a the ${docVars.size} vars: a the ${knownVars.size} config vars + a the ${KMS_VARS.size} KMS vars, a the no missing / a the no extra)`
);
