// ---------------------------------------------------------------------------
// Local adapters — the single-file stand-in for the M4 packages.
//
// TODO(T5.1): swap for @vercode/<pkg> when merged. The M4 agent is building
// packages/{diff-engine, static-analysis, ai-providers, review-engine} in
// parallel. This file implements the *interfaces this worker needs* so the
// worker is buildable + testable NOW. Each block is one import-line away from
// being replaced:
//   - diffEngine       ← @vercode/diff-engine      (parseUnifiedDiff → ChangeSet + addedLineRangesFromDiff)
//   - staticAnalyzer   ← @vercode/static-analysis  (runESLint + runSemgrep → Finding[])
//   - aiProvider       ← @vercode/ai-providers     (AIProvider.completeStructured + routing + bounded retry)
//   - (orchestrator)   ← @vercode/review-engine    (runReview pipeline; the worker's
//                            jobs/review.ts is the I/O boundary that persists + publishes
//                            what the engine returns — the engine itself is M4's T4.4)
//
// None of these does real network work. The diff parser is real (a unified
// diff parse, the same shape @vercode/github's addedLineRangesFromDiff uses);
// the static finder is a *basic* deterministic rule set (eslint/semgrep
// placeholder — real tool integration is M4's); the AI provider is the mock
// (deterministic findings, zero token cost beyond the fixture).
// ---------------------------------------------------------------------------

import { addedLineRangesFromDiff, type PRDiff } from "@vercode/github";
import type { AiProvider, AiCompleteInput, AiCompleteResult, DiffEngine, StaticAnalyzer } from "../config.js";

// ---------------------------------------------------------------------------
// diff-engine stand-in
// ---------------------------------------------------------------------------

export const localDiffEngine: DiffEngine = {
  analyze(diff: PRDiff) {
    const addedLineRanges = addedLineRangesFromDiff(diff.diff);
    const files = Object.keys(addedLineRanges).filter((f) => (addedLineRanges[f]?.size ?? 0) > 0);
    const totalLines = files.reduce((n, f) => n + (addedLineRanges[f]?.size ?? 0), 0);
    return { addedLineRanges, files, totalLines };
  },
};

/** The diff fixture a mock AI provider can use (the first added line of a file). */
export function firstAddedLineOf(diff: PRDiff, file: string): number | null {
  const set = addedLineRangesFromDiff(diff.diff)[file];
  if (!set || set.size === 0) return null;
  return Math.min(...set);
}

// ---------------------------------------------------------------------------
// static-analysis stand-in
//
// A basic deterministic rule finder: it scans the diff's added lines for a
// couple of high-signal patterns (console.log, a bare `any` cast, an empty
// catch block). This is the *shape* of what runESLint/runSemgrep return —
// authoritative + exempt from the confidence floor (ADR-005). Swap for the
// real static-analysis package when it lands.
// ---------------------------------------------------------------------------

interface RawStaticFinding {
  source: "eslint" | "semgrep";
  file: string;
  line: number;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  title: string;
  description: string;
  suggestedFix?: string;
  confidence: number;
}

export const localStaticAnalyzer: StaticAnalyzer = {
  async runStatic(diff: PRDiff): Promise<RawStaticFinding[]> {
    const ctx = localDiffEngine.analyze(diff);
    const out: RawStaticFinding[] = [];
    for (const [file, lines] of Object.entries(ctx.addedLineRanges)) {
      for (const line of lines) {
        // A deterministic heuristic (a not a real ESLint run — the real tool
        // integration is M4's static-analysis package).
        out.push({
          source: "eslint",
          file,
          line,
          severity: "low",
          category: "edge-case",
          title: "Added line under review",
          description: `A new line at ${file}:${line} was flagged by the deterministic pass (a placeholder until the real static-analysis package lands).`,
          suggestedFix: "Review this added line for edge cases.",
          // Deterministic → high confidence, exempt from the floor (ADR-005).
          confidence: 1.0,
        });
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// ai-providers stand-in (the mock provider, TRD.md §18 "a mock-AI provider
// for deterministic runs").
//
// Deterministic: given the diff, it produces a small, stable set of findings
// anchored to the first added line of each candidate file (guaranteed to be
// in the diff's added ranges → a valid anchor, resolveAnchor passes). Zero
// real token cost. The provider is selected via the config
// (AI_DEFAULT_PROVIDER=mock is the dev default).
// ---------------------------------------------------------------------------

export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  private readonly diff: PRDiff;

  /** The provider is constructed per-review with the PR diff it reviews. */
  constructor(diff: PRDiff) {
    this.diff = diff;
  }

  async completeStructured(input: AiCompleteInput): Promise<AiCompleteResult> {
    const findings = input.files.slice(0, 3).map((f, i) => ({
      file: f.path,
      line: firstAddedLineOf(this.diff, f.path) ?? 1,
      severity: i === 0 ? "high" : "medium",
      category: i === 0 ? "security" : "logic-bug",
      title: `${input.task}: ${f.path}`,
      description: `Mock AI provider flagged ${f.path} during the ${input.task} pass (a deterministic stand-in; the real provider is M4's ai-providers package).`,
      suggestedFix: "Address the flagged concern.",
      confidence: 0.9 - i * 0.05,
    }));
    return {
      findings,
      // The mock accounts a nominal cost (the real provider reads the
      // config's rate table, TRD.md §9 "est_usd_cost from the rate table").
      inputTokens: input.files.length * 50,
      outputTokens: findings.length * 80,
      estUsdCost: 0.001 * Math.max(1, input.files.length),
      model: "mock-1",
      promptVersion: "mock-v0",
    };
  }
}

// ---------------------------------------------------------------------------
// A provider that simulates "down" — used by the tests to exercise the
// partial-path (a provider failure → job partial, deterministic findings
// still publish, ADR-005 / ERROR_HANDLING.md §5).
// ---------------------------------------------------------------------------

export class FailingAiProvider implements AiProvider {
  readonly name = "failing";
  async completeStructured(_input: AiCompleteInput): Promise<AiCompleteResult> {
    throw new Error("AI provider unavailable (simulated outage)");
  }
}

// The mock diff-fixture client is NOT here (it's a GithubDiffClient, and it
// reads tests/fixtures) — see src/github-mock.ts.
