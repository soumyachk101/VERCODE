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
// Findings are emitted in a shape that extends @vercode/contracts'
// ReviewFinding with a `source` field ("eslint" | "semgrep"). Confidence is
// always 1.0 (deterministic rules — no confidence floor applies,
// REVIEW_ENGINE_SPEC §2 stage [4]).
//
// Resource caps: files over 2000 lines are flagged `huge` and skipped
// (a pathological file is bounded, not a crash; UT-static-runner-01/02).

import {
  ReviewFindingSchema,
  type ReviewFinding,
  type FindingSeverity,
  type FindingCategory,
} from "@vercode/contracts";

/**
 * A deterministic static-analysis finding. Extends ReviewFinding with the
 * `source` field (the contract's FindingSourceSchema covers the enum values;
 * `ReviewFindingSchema` itself does not carry the field, so this package
 * adds it explicitly).
 */
export interface StaticFinding extends ReviewFinding {
  source: "eslint" | "semgrep";
}

// ---------------------------------------------------------------------------
// The analyzer seam — the interface a real ESLint/Semgrep adapter implements
// ---------------------------------------------------------------------------

export interface AnalyzerResult {
  findings: StaticFinding[];
  /** Files the analyzer skipped (over the line cap, binary, etc.). */
  skipped: { path: string; reason: "huge" }[];
}

export interface Analyzer {
  readonly id: string;
  analyze(
    files: Map<string, string>,
    caps?: { maxLines?: number }
  ): AnalyzerResult;
}

// ---------------------------------------------------------------------------
// The built-in pattern rules (Semgrep-like, deterministic)
//
// Each rule:
// - a line regex to match against source lines,
// - a negation regex (when set, matching lines are NOT findings — this
//   excludes parameterized queries from the SQL-concat rule),
// - a category / severity / title.
// ---------------------------------------------------------------------------

export interface Rule {
  id: string;
  title: string;
  description: string;
  category: FindingCategory;
  severity: FindingSeverity;
  linePattern: RegExp;
  negation?: RegExp;
  suggestedFix?: string;
}

const RULES: Rule[] = [
  {
    id: "sql-concat",
    title: "SQL string concatenation (injection risk)",
    description:
      "SQL query is built by string concatenation, which allows SQL injection. Use parameterized queries instead.",
    category: "security",
    severity: "high",
    linePattern:
      /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b[^;+\n]{0,64}["'`]\s*\+/i,
    negation: /\$|\?|:param|prepared/i,
    suggestedFix: "Use a parameterized query (prepared statement) instead of string concatenation.",
  },
  {
    id: "sql-template-injection",
    title: "SQL query with template-literal interpolation",
    description:
      "SQL query is built with a template literal that interpolates user input. Use a parameterized query instead.",
    category: "security",
    severity: "high",
    linePattern: /[`"]\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\s[^`"\n]*\$\{/i,
    suggestedFix: "Use a parameterized query instead of template-literal string interpolation.",
  },
  {
    id: "eval-usage",
    title: "eval() or new Function() — code injection risk",
    description:
      "eval() and new Function() execute arbitrary code from strings, which is a critical injection vulnerability when input is not fully trusted.",
    category: "security",
    severity: "critical",
    linePattern: /\beval\s*\(|\bnew\s+Function\s*\(/i,
    suggestedFix: "Avoid eval()/new Function(). Use a safe alternative (structured data, whitelist, or a constrained parser).",
  },
  {
    id: "exec-string",
    title: "child_process.exec with dynamic string",
    description:
      "child_process.exec called with a string that may contain untrusted input — command injection risk.",
    category: "security",
    severity: "high",
    linePattern: /\bexec\s*\(\s*["'`][^"'`\n]*["'`]\s*\+/i,
    suggestedFix: "Use execFile or spawn with an argument array instead of exec with a concatenated string.",
  },
  {
    id: "hardcoded-secret",
    title: "Hardcoded secret or API key in source",
    description:
      "A secret-looking value is hardcoded in source. Secrets should be loaded from environment variables or a secret store.",
    category: "security",
    severity: "critical",
    linePattern:
      /\b(password|passwd|pwd|secret|api[-_]?key|access[-_]?key|auth[-_]?token|private[-_]?key)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    suggestedFix: "Move the value to an environment variable or secret store; never commit secrets to source.",
  },
  {
    id: "missing-await",
    title: "Missing await on a promise-returning call",
    description:
      "A promise-returning function is called without await. The result may be used before it resolves, causing a logic bug.",
    category: "logic-bug",
    severity: "medium",
    // A .then/.catch/.finally chain assigned or used without an enclosing
    // async/await context — a heuristic, not exhaustive.
    linePattern:
      /^\s*(?:const|let|var)\s+\w+\s*=\s*[\w$.]+\s*\(\s*(?:(?:async\s+\w+\s+\(\)|[\w$]+\s+\([^)]*\)))?\s*\)\s*\.then\s*\(/i,
    suggestedFix: "Add `await` before the promise-returning call, or handle the promise explicitly.",
  },
];

// ---------------------------------------------------------------------------
// The built-in pattern engine (implements Analyzer)
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_LINES = 2000;

export class PatternEngineAnalyzer implements Analyzer {
  readonly id = "pattern-engine";

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
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!rule.linePattern.test(line)) continue;
          if (rule.negation && rule.negation.test(line)) continue;
          const finding: StaticFinding = {
            id: `static-${rule.id}-${path}:${i + 1}`,
            file: path,
            line: i + 1,
            severity: rule.severity,
            category: rule.category,
            title: rule.title,
            description: rule.description,
            suggestedFix: rule.suggestedFix,
            confidence: 1.0,
            source: "semgrep" as const,
          };
          findings.push(finding);
        }
      }
    }
    return { findings, skipped };
  }
}

// ---------------------------------------------------------------------------
// Public entry points (the task spec's `runESLint` / `runSemgrep` signatures)
//
// The MVP pattern engine is used for both — the labels "eslint" and
// "semgrep" are what the engine's merge step expects. A future real-tool
// adapter would implement Analyzer and slot in here.
// ---------------------------------------------------------------------------

export function runESLint(
  files: Map<string, string>,
  caps?: { maxLines?: number }
): AnalyzerResult {
  const result = new PatternEngineAnalyzer().analyze(files, caps);
  result.findings = result.findings.map((f) => ({ ...f, source: "eslint" as const }));
  return result;
}

export function runSemgrep(
  files: Map<string, string>,
  caps?: { maxLines?: number }
): AnalyzerResult {
  return new PatternEngineAnalyzer().analyze(files, caps);
}

/**
 * Run the full deterministic pass (all rules, both sources merged).
 * This is the convenience entry the worker calls.
 */
export function runStaticAnalysis(
  files: Map<string, string>,
  caps?: { maxLines?: number }
): AnalyzerResult {
  return new PatternEngineAnalyzer().analyze(files, caps);
}
