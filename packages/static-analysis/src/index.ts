// static-analysis — deterministic pattern-based rules engine.
//
// MVP: a lightweight, built-in Semgrep-like pattern engine (SQL concatenation,
// eval/exec usage, hardcoded-secret regex, missing-await on promises) applied
// to the changed files' contents. NO shell-out to real eslint/semgrep
// binaries — the package stays dependency-light. The real-ESLint / real-
// Semgrep integration is a *documented later swap*: this module exposes an
// Analyzer interface that the built-in pattern engine implements, and a
// real-tool adapter can implement the same interface and slot in without
// touching the caller (ADR-006's additive-leaf principle).
//
// Findings are emitted in the @vercode/contracts ReviewFinding shape with
// source "eslint" | "semgrep", confidence 1.0 (deterministic rules — no
// confidence floor applies, REVIEW_ENGINE_SPEC §2 stage [4]).
//
// Resource caps: files over 2000 lines are flagged `huge` and skipped
// (a pathological file is bounded, not a crash; UT-static-runner-01/02).

import { z } from "zod";

// ---------------------------------------------------------------------------
// The Finding shape (the @vercode/contracts ReviewFinding, re-exposed here)
// ---------------------------------------------------------------------------

// The contracts package owns the schema; re-import it under a short alias.
// The findings produced here are validated against ReviewFindingSchema
// before they leave this module (an invariant of the whole system: no
// finding ever leaves a package unvalidated).
import { ReviewFindingSchema, type ReviewFinding } from "@vercode/contracts";

export type StaticFinding = ReviewFinding;

// ---------------------------------------------------------------------------
// The analyzer seam — the interface a real ESLint/Semgrep adapter implements
// ---------------------------------------------------------------------------

export interface AnalyzerResult {
  findings: StaticFinding[];
  /** Files the analyzer skipped (e.g. over the line cap). */
  skipped: { path: string; reason: "huge" }[];
}

export interface Analyzer {
  readonly id: "eslint" | "semgrep" | "pattern-engine";
  /**
   * Run over the changed files' contents.
   * `files` is a path → content map (the worker fetches the head-SHA
   * contents; the engine passes them in).
   */
  analyze(
    files: Map<string, string>,
    caps?: { maxLines?: number }
  ): AnalyzerResult;
}

// ---------------------------------------------------------------------------
// The built-in pattern rules (Semgrep-like, deterministic)
// ---------------------------------------------------------------------------

export interface Rule {
  id: string;
  description: string;
  category: ReviewFinding["category"];
  severity: ReviewFinding["severity"];
  /** The regex to test against a single source line. */
  linePattern: RegExp;
  /** Optional: when set, the rule only applies to files whose path matches. */
  fileFilter?: RegExp;
  /** Optional: a negation pattern — lines matching this do NOT trigger the rule. */
  negation?: RegExp;
}

const RULES: Rule[] = [
  {
    id: "sql-concat",
    description: "SQL string concatenation (injection risk)",
    category: "security",
    severity: "high",
    linePattern:
      /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b[^\n]*["'`][^"'`\n]*["'`]\s*[+\+]\s*[^\n]*$/i,
    negation: /\$|\?|:param|::|prepared/i,
  },
  {
    id: "sql-concat-2",
    description: "SQL string concatenation via template literal interpolation",
    category: "security",
    severity: "high",
    linePattern:
      /["'`]SELECT\s[^"'`\n]*["'`]\s*[\+]\s*["'`]?|["'`]INSERT\s[^"'`\n]*["'`]\s*[\+]\s*["'`]?|["'`]UPDATE\s[^"'`\n]*["'`]\s*[\+]\s*["'`]?|["'`]DELETE\s[^"'`\n]*["'`]\s*[\+]\s*["'`]?/i,
    negation: /\$|\?|:param/i,
  },
  {
    id: "sql-template-injection",
    description: "SQL query built with template-literal interpolation",
    category: "security",
    severity: "high",
    linePattern:
      /[`"]\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\s[^`" ]*\$\{/i,
    negation: /\?|\$[a-zA-Z]/,
  },
  {
    id: "eval-usage",
    description: "eval() / exec() — code injection risk",
    category: "security",
    severity: "critical",
    linePattern: /\beval\s*\(|\bnew\s+Function\s*\(|\bexec\s*\(\s*["'`]/i,
  },
  {
    id: "hardcoded-secret",
    description: "Hardcoded secret or API key in source",
    category: "security",
    severity: "critical",
    linePattern:
      /\b(password|passwd|pwd|secret|api[-_]?key|access[-_]?key|token|private[-_]?key)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  },
  {
    id: "missing-await",
    description: "Await missing on a promise-returning call (likely a bug)",
    category: "logic-bug",
    severity: "medium",
    linePattern:
      /^\s*(const|let|var)\s+\w+\s*=\s*[^;]*\.(then|catch|finally)\b|^\s*\w+\s*\([^)]*\)\s*\.then\s*\(/,
  },
];

// ---------------------------------------------------------------------------
// The built-in pattern engine (implements Analyzer)
// ---------------------------------------------------------------------------

const DEFAULT_MAX_LINES = 2000;

export class PatternEngineAnalyzer implements Analyzer {
  readonly id = "pattern-engine" as const;

  analyze(files: Map<string, string>, caps?: { maxLines?: number }): AnalyzerResult {
    const maxLines = caps?.maxLines ?? DEFAULT_MAX_LINES;
    const findings: StaticFinding[] = [];
    const skipped: { path: string; reason: "huge" }[] = [];

    for (const [path, content] of files) {
      const lines = content.split("\n");
      if (lines.length > maxLines) {
        skipped.push({ path, reason: "huge" });
        continue;
      }
      for (const rule of RULES) {
        if (rule.fileFilter && !rule.fileFilter.test(path)) continue;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!rule.linePattern.test(line)) continue;
          if (rule.negation && rule.negation.test(line)) continue;
          // A rule may have a global negation: skip lines that look like a
          // parameterized query.
          if (rule.negation?.test(line)) continue;
          const findingId = `static-${rule.id}-${path}:${i + 1}`;
          const parsed = ReviewFindingSchema.safeParse({
            id: findingId,
            file: path,
            line: i + 1,
            severity: rule.severity,
            category: rule.category,
            title: rule.description,
            description: `${rule.description} at ${path}:${i + 1}`,
            confidence: 1.0,
            source: this.id === "pattern-engine" ? "semgrep" : this.id,
          } satisfies Record<string, unknown>);
          if (parsed.success) {
            findings.push(parsed.data as StaticFinding);
          }
        }
      }
    }
    return { findings, skipped };
  }
}

// ---------------------------------------------------------------------------
// Public entry points (the task spec's `runESLint` / `runSemgrep` signatures)
// ---------------------------------------------------------------------------

// The "eslint" source — a lightweight rules check (MVP: same pattern engine,
// labelled "eslint"). A real ESLint adapter would slot in here.
export function runESLint(
  files: Map<string, string>,
  caps?: { maxLines?: number }
): AnalyzerResult {
  const engine = new PatternEngineAnalyzer();
  const result = engine.analyze(files, caps);
  // Relabel the source for ESLint-style findings.
  result.findings = result.findings.map((f) => ({ ...f, source: "eslint" as const }));
  return result;
}

// The "semgrep" source — the pattern engine as Semgrep-equivalent.
export function runSemgrep(
  files: Map<string, string>,
  caps?: { maxLines?: number }
): AnalyzerResult {
  const engine = new PatternEngineAnalyzer();
  return engine.analyze(files, caps);
}

// A single convenience function: run all deterministic checks, return findings.
export function runStaticAnalysis(
  files: Map<string, string>,
  caps?: { maxLines?: number }
): AnalyzerResult {
  const engine = new PatternEngineAnalyzer();
  return engine.analyze(files, caps);
}

export { z };
