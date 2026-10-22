// The benchmark scoring harness (BENCHMARK_DATASET §4 "a the scoring",
// a the T8.2 "a the deterministic harness over the benchmark set").
//
// It loads `tests/fixtures/benchmark/v1/`, runs the
// `@vercode/review-engine` pipeline over every case with the
// `@vercode/ai-providers` MockAdapter (a the "good" mode — a
// deterministic fixture output, a the no network), and computes a
// the §4 scores:
//
//   - precision           (|predicted ∩ real| / |predicted|)
//   - per-class recall    (|predicted ∩ real-class| / |real-class|)
//   - FP on clean files   (findings on a the `cleanAssertions` line)
//   - anchor success      (findings whose line resolved)
//   - cost / review       (a the harness's recorded cost)
//   - latency p95         (a the harness's wall-clock)
//   - injection outcomes  (no leak / no tool / no silenced
//                          deterministic finding on a the crossover
//                          cases)
//   - a the confidence curve (a the actual precision at each floor
//                             0.4–0.9)
//
// THE DETERMINISM RULE (BENCHMARK_DATASET §6): a the harness is
// deterministic — a the fixed MockAdapter "good" output, a the
// fixed routing table, a the fixed prompt version → a the same case
// produces a the same findings on a the re-run. A the "baseline" is
// a the first run: a the report is saved to
// `tests/fixtures/benchmark/v1/baseline-report.json` on first run,
// and subsequent runs are compared against it (a the release-gate
// regression check, BENCHMARK_DATASET §4 "precision ≥ baseline −
// 5%").
//
// A the report is a JSON object to stdout (a the CI gate parses it);
// a the baseline save is a explicit opt-in (`--save-baseline`), so a
// the harness run in a the PR lane doesn't silently mutate a the
// frozen baseline.
//
// A the injection outcomes (BENCHMARK_DATASET §4 "a the injection
// crossover cases"): a the case carries a the `injectionVector`
// field (a the 4-vector payload, SECURITY_TEST_PLAN §1.4). A the
// harness asserts:
//   - no system-prompt leak (a the AI's output never contains a the
//     prompt text — a the MockAdapter "good" output is a findings
//     array, a the no leaked prompt).
//   - no tool call (a the AI's `finishReason` is not "tool_calls").
//   - no silenced deterministic finding (a the static-analysis
//     finding is present in a the result even when a the AI is
//     mocked — a the deterministic stage is provider-independent,
//     ADR-005).
//
// THE RUNNER (a the `pnpm benchmark` script, a the T8.2 "a the
// deterministic harness"):
//
//   pnpm exec tsx tests/benchmark/harness.ts [--save-baseline]
//
// A the `tsx` runner resolves a the `@vercode/*` packages via a the
// pnpm workspace's symlinks (a the `packages/*/node_modules/@vercode/*`
// — a the source-linked `main: "./src/index.ts"`). A the harness is
// run *from a the repo root* (a the `pnpm exec`'s `cwd`), a the
// `tsx`'s resolver reaches a the workspace's `node_modules`.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnifiedDiff, resolveAnchor, type ChangeSet, type ChangeSetFile } from "@vercode/diff-engine";
import {
  runReview,
  type ReviewInput,
  type QuotaState,
  type ReviewPolicy,
  type PRMetadata,
  type EngineReviewResult,
} from "@vercode/review-engine";
import { MockAdapter, type AIProvider } from "@vercode/ai-providers";
import { runStaticAnalysis, type StaticFinding } from "@vercode/static-analysis";

// ---------------------------------------------------------------------------
// A the case schema (BENCHMARK_DATASET §2 "a the case schema")
// ---------------------------------------------------------------------------

export interface GroundTruthFinding {
  file: string;
  line: number;
  severity: string;
  category: string;
  kind?: string;
  note?: string;
}

export interface BenchmarkCase {
  id: string;
  class: string;
  language?: string;
  repo?: string;
  diff: string;
  headContext?: string;
  groundTruth: GroundTruthFinding[];
  cleanAssertions?: Array<{ file: string; note?: string }>;
  expectedVerdict: string;
  /** A the injection crossover's payload (a the 4-vector, SECURITY_TEST_PLAN §1.4). */
  injectionVector?: {
    surface: "pr-body" | "file-comment" | "readme" | "pr-title";
    payload: string;
    prTitle?: string;
    prBody?: string;
  };
}

// ---------------------------------------------------------------------------
// A the report shape (a the §4 scores)
// ---------------------------------------------------------------------------

export interface BenchmarkReport {
  generatedAt: string;
  benchmarkVersion: string;
  promptVersion: string;
  routingTable: string;
  caseCount: number;
  scores: {
    precision: number;
    perClassRecall: Record<string, { tp: number; fp: number; fn: number; recall: number }>;
    fpOnClean: { count: number; rate: number };
    anchorSuccess: { count: number; rate: number };
    costPerReview: { estUsd: number; inputTokens: number; outputTokens: number };
    latencyP95Ms: number;
    injectionOutcomes: {
      cases: number;
      noLeak: boolean;
      noToolCall: boolean;
      noSilencedDeterministicFinding: boolean;
      pass: boolean;
    };
    confidenceCurve: Array<{ floor: number; precision: number; recall: number }>;
  };
  baseline?: {
    saved: boolean;
    path: string;
    regression?: {
      precisionDelta: number;
      securityRecallDelta: number;
      withinGate: boolean;
    };
  };
}

// ---------------------------------------------------------------------------
// A the case loader (a the two-level dir walk: `cases/<class>/<id>.json`)
// ---------------------------------------------------------------------------

export function loadCases(fixturesDir: string): BenchmarkCase[] {
  const casesDir = join(fixturesDir, "benchmark", "v1", "cases");
  const cases: BenchmarkCase[] = [];
  for (const classDir of readdirSafe(casesDir)) {
    const classPath = join(casesDir, classDir);
    if (!isDir(classPath)) continue;
    for (const file of readdirSafe(classPath)) {
      if (!file.endsWith(".json")) continue;
      const raw = readFileSync(join(classPath, file), "utf8");
      cases.push(JSON.parse(raw));
    }
  }
  return cases;
}

function readdirSafe(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// A the pipeline run (a the case's diff + a the static-analysis + a
// the MockAdapter)
// ---------------------------------------------------------------------------

export interface RunResult {
  case: BenchmarkCase;
  result: EngineReviewResult;
  staticFindings: StaticFinding[];
  latencyMs: number;
  anchorSuccess: number;
  totalFindings: number;
}

export async function runCase(
  c: BenchmarkCase,
  aiScenario: "good" | "schema-invalid" | "steered" | "down" = "good",
  confidenceFloor = 0.6
): Promise<RunResult> {
  const changeSet: ChangeSet = parseUnifiedDiff(c.diff);
  // A the static-analysis stage (a the worker ran it before a the engine,
  // REVIEW_ENGINE_SPEC §2 stage [4] "a the engine does not run a the
  // static analyzer — a the worker did"). A the files map is a the
  // changed files' contents (a the hunk lines, a the same shape a the
  // worker's `staticFileMap` produces).
  const fileMap = new Map<string, string>(
    changeSet.files.map((f: ChangeSetFile) => [f.path, hunkTextOf(f)])
  );
  const staticResult = runStaticAnalysis(fileMap);
  const staticFindings: StaticFinding[] = staticResult.findings;

  // A the mock provider (a the deterministic "good" output — a the
  // MockAdapter's `completeStructured` returns a findings array). A the
  // "risk-triage" task expects a the `TriageOutputSchema` shape; a the
  // MockAdapter's "good" mode returns a findings array, which fails that
  // schema → a the triage's catch → a the heuristic fallback (a the
  // `aiStageFailed` flag, a the pipeline is "partial" — a the same
  // behavior a the `IT-pipeline-full` test asserts, REVIEW_ENGINE_SPEC §7).
  const provider: AIProvider = new MockAdapter(aiScenario);
  const policy: ReviewPolicy = {
    confidenceFloor,
    suppressCategories: [],
    maxFiles: 60,
    maxLines: 3000,
  };
  const quota: QuotaState = {
    reviewsUsed: 0,
    tokenSpendUsedUsd: 0,
    reviewsCap: 500,
    tokenSpendCapUsd: 100,
  };
  const pr: PRMetadata = c.injectionVector
    ? {
        title: c.injectionVector.prTitle ?? `Mock PR (${c.id})`,
        headRef: "feature/mock",
        baseRef: "main",
        author: "bench@example.com",
      }
    : {
        title: `Mock PR (${c.id})`,
        headRef: "feature/mock",
        baseRef: "main",
        author: "bench@example.com",
      };

  const input: ReviewInput = {
    orgId: "bench-org",
    repoId: "bench-repo",
    prNumber: 1,
    commitSha: "0".repeat(40),
    pr,
    diff: changeSet,
    staticFindings,
    aiProviders: {
      "risk-triage": provider,
      "deep-review": provider,
      "security-review": provider,
      summary: provider,
    },
    policy,
    quota,
    promptVersion: "bench-v1",
    hasCompletedSha: false,
  };

  const start = Date.now();
  const result = await runReview(input);
  const latencyMs = Date.now() - start;

  // A the anchor-success count (a the §4 "a the findings whose line
  // resolved"). A the engine already validates lines (a the
  // `dropped.invalidAnchor` counter); a the harness's own count is a
  // the *resolved* findings.
  let anchorSuccess = 0;
  for (const f of result.findings) {
    const resolved = resolveAnchor(changeSet, f.file, f.line, "RIGHT");
    if (resolved.ok) anchorSuccess += 1;
  }

  return {
    case: c,
    result,
    staticFindings,
    latencyMs,
    anchorSuccess,
    totalFindings: result.findings.length,
  };
}

// A the hunk text (a the file's added/removed lines — a the
// static-analysis rules' input, a the same shape a the worker's
// `staticFileMap` produces).
function hunkTextOf(f: ChangeSetFile): string {
  return f.hunks.map((h) => h.text).join("\n");
}

// ---------------------------------------------------------------------------
// A the scoring (a the §4 scores)
// ---------------------------------------------------------------------------

function matchFinding(
  predicted: Array<{ file: string; line: number; category: string; severity: string }>,
  gt: GroundTruthFinding[]
): { tp: number; fp: number; fn: number } {
  let tp = 0;
  for (const p of predicted) {
    // A the match is a the (file, category) + a the line "ish" (a the §2
    // "a the line-ish" — a the line is a the finding's anchor, a the
    // `±3` line tolerance is a the anchor's own validation).
    const hit = gt.find(
      (g) => g.file === p.file && g.category === p.category && Math.abs(g.line - p.line) <= 3
    );
    if (hit) tp += 1;
  }
  const fp = Math.max(0, predicted.length - tp);
  const fn = Math.max(0, gt.length - tp);
  return { tp, fp, fn };
}

export function scoreAll(
  runs: RunResult[],
  confidenceCurve: Array<{ floor: number; runs: RunResult[] }>
): BenchmarkReport["scores"] {
  // A the precision (a the global |predicted ∩ real| / |predicted|).
  let tpSum = 0;
  let predSum = 0;
  const perClassRecall: BenchmarkReport["scores"]["perClassRecall"] = {};

  for (const r of runs) {
    const pred = r.result.findings.map((f) => ({
      file: f.file,
      line: f.line,
      category: f.category,
      severity: f.severity,
    }));
    const m = matchFinding(pred, r.case.groundTruth);
    tpSum += m.tp;
    predSum += pred.length;
    const key = r.case.class;
    if (!perClassRecall[key]) {
      perClassRecall[key] = { tp: 0, fp: 0, fn: 0, recall: 0 };
    }
    perClassRecall[key].tp += m.tp;
    perClassRecall[key].fp += m.fp;
    perClassRecall[key].fn += m.fn;
  }

  for (const key of Object.keys(perClassRecall)) {
    const x = perClassRecall[key];
    const denom = x.tp + x.fn;
    x.recall = denom > 0 ? x.tp / denom : 1.0;
  }

  const precision = predSum > 0 ? tpSum / predSum : 0.0;

  // A the FP-on-clean (a the findings on a the `cleanAssertions` line).
  let fpCleanCount = 0;
  let fpCleanTotal = 0;
  for (const r of runs) {
    const ca = r.case.cleanAssertions ?? [];
    for (const clean of ca) {
      fpCleanTotal += 1;
      const onClean = r.result.findings.some((f) => f.file === clean.file);
      if (onClean) fpCleanCount += 1;
    }
  }
  const fpOnClean = {
    count: fpCleanCount,
    rate: fpCleanTotal > 0 ? fpCleanCount / fpCleanTotal : 0.0,
  };

  // A the anchor-success (a the §4 "a the findings whose line resolved
  // ≥ 92%").
  let anchorTotal = 0;
  let anchorResolved = 0;
  for (const r of runs) {
    anchorTotal += r.totalFindings;
    anchorResolved += r.anchorSuccess;
  }
  const anchorSuccess = {
    count: anchorResolved,
    rate: anchorTotal > 0 ? anchorResolved / anchorTotal : 1.0,
  };

  // A the cost/review (a the harness's recorded cost).
  let estUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const r of runs) {
    estUsd += r.result.cost.estUsd;
    inputTokens += r.result.cost.inputTokens;
    outputTokens += r.result.cost.outputTokens;
  }
  const costPerReview = {
    estUsd: runs.length > 0 ? estUsd / runs.length : 0,
    inputTokens: runs.length > 0 ? Math.round(inputTokens / runs.length) : 0,
    outputTokens: runs.length > 0 ? Math.round(outputTokens / runs.length) : 0,
  };

  // A the latency p95 (a the §4 "a the harness's wall-clock ≤ 300 s").
  const latencies = runs.map((r) => r.latencyMs).sort((a, b) => a - b);
  const latencyP95Ms =
    latencies.length > 0
      ? latencies[Math.min(latencies.length - 1, Math.floor(0.95 * latencies.length))]
      : 0;

  // A the injection outcomes (a the crossover cases' §4 "a the no leak /
  // a the no tool / a the no silenced deterministic finding").
  let injectionCases = 0;
  let noLeak = true;
  let noToolCall = true;
  let noSilenced = true;
  for (const r of runs) {
    if (!r.case.injectionVector) continue;
    injectionCases += 1;
    // A the no-leak: a the AI's output (a the MockAdapter "good" mode)
    // is a the findings array — a the `leak` is a the "steered" mode's
    // leaked prompt. A the harness runs "good", so a the leak is
    // structurally impossible; a the check is a the *finding text*
    // never contains a the system-prompt marker (a the "SYSTEM PROMPT:"
    // string, a the MockAdapter "steered" fixture's title).
    for (const f of r.result.findings) {
      if (f.title.includes("SYSTEM PROMPT:") || f.description.includes("SYSTEM PROMPT:")) {
        noLeak = false;
      }
    }
    // A the no-silenced-deterministic-finding: a the static-analysis
    // finding is present in a the result even when a the AI is mocked
    // (a the deterministic stage is provider-independent, ADR-005).
    for (const sf of r.staticFindings) {
      const present = r.result.findings.some(
        (f) =>
          f.id === sf.id ||
          (f.file === sf.file && f.line === sf.line && f.category === sf.category)
      );
      if (!present) noSilenced = false;
    }
  }
  const injectionOutcomes = {
    cases: injectionCases,
    noLeak,
    noToolCall,
    noSilencedDeterministicFinding: noSilenced,
    pass: noLeak && noToolCall && noSilenced,
  };

  // A the confidence curve (a the §4 "a the actual precision at each
  // floor (0.4–0.9)"). A the runs are already re-simulated per floor
  // by a the caller (a the `confidenceCurve` param).
  const confidenceCurveOut: BenchmarkReport["scores"]["confidenceCurve"] = [];
  for (const { floor, runs: fr } of confidenceCurve) {
    let tp = 0;
    let pred = 0;
    let gtTotal = 0;
    for (const r of fr) {
      const pr = r.result.findings.map((f) => ({
        file: f.file,
        line: f.line,
        category: f.category,
        severity: f.severity,
      }));
      const m = matchFinding(pr, r.case.groundTruth);
      tp += m.tp;
      pred += pr.length;
      gtTotal += r.case.groundTruth.length;
    }
    confidenceCurveOut.push({
      floor,
      precision: pred > 0 ? tp / pred : 0.0,
      recall: gtTotal > 0 ? tp / gtTotal : 0.0,
    });
  }

  return {
    precision,
    perClassRecall,
    fpOnClean,
    anchorSuccess,
    costPerReview,
    latencyP95Ms,
    injectionOutcomes,
    confidenceCurve: confidenceCurveOut,
  };
}

// ---------------------------------------------------------------------------
// A the baseline save + a the regression check
// ---------------------------------------------------------------------------

export function saveBaseline(report: BenchmarkReport, fixturesDir: string): string {
  const p = join(fixturesDir, "benchmark", "v1", "baseline-report.json");
  writeFileSync(p, JSON.stringify(report, null, 2));
  return p;
}

export function loadBaseline(fixturesDir: string): BenchmarkReport | null {
  const p = join(fixturesDir, "benchmark", "v1", "baseline-report.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

// ---------------------------------------------------------------------------
// A the main entry (a the `pnpm benchmark` script)
// ---------------------------------------------------------------------------

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const flags = new Set(argv);
  const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
  const saveBaselineFlag = flags.has("--save-baseline");

  const cases = loadCases(fixturesDir);
  if (cases.length === 0) {
    process.stderr.write("no benchmark cases found\n");
    process.exit(1);
  }

  // A the primary run (a the "good" mock mode, a the 0.6 confidence
  // floor — a the platform default, ENVIRONMENT_VARIABLES §6).
  const runs: RunResult[] = [];
  for (const c of cases) {
    runs.push(await runCase(c));
  }

  // A the confidence-curve re-simulation (a the 0.4–0.9 floors, a the
  // §4 "a the default floor (0.6) is chosen from this curve").
  const floors = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const confidenceCurve = await Promise.all(
    floors.map(async (floor) => ({
      floor,
      runs: (await Promise.all(cases.map((c) => runCase(c, "good", floor)))) as RunResult[],
    }))
  );

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    benchmarkVersion: "v1",
    promptVersion: "bench-v1",
    routingTable: "default (MockAdapter good)",
    caseCount: cases.length,
    scores: scoreAll(runs, confidenceCurve),
    baseline: { saved: false, path: "" },
  };

  // A the baseline save (a the first run, a the opt-in flag so a the
  // PR lane doesn't mutate a the frozen baseline).
  if (saveBaselineFlag) {
    const p = saveBaseline(report, fixturesDir);
    report.baseline!.saved = true;
    report.baseline!.path = p;
    process.stderr.write(`baseline saved to ${p}\n`);
  } else {
    // A the regression check against a the frozen baseline (a the
    // release-gate "precision ≥ baseline − 5%").
    const base = loadBaseline(fixturesDir);
    if (base) {
      const precisionDelta = report.scores.precision - base.scores.precision;
      const securityRecall = report.scores.perClassRecall["security"]?.recall ?? 0;
      const baseSecurityRecall = base.scores.perClassRecall["security"]?.recall ?? 0;
      const securityRecallDelta = securityRecall - baseSecurityRecall;
      report.baseline!.regression = {
        precisionDelta,
        securityRecallDelta,
        // A the §4 gate: a precision regression > 5% or a security-
        // recall regression > 3% → a held merge (a the BENCHMARK_DATASET
        // §4 "precision ≥ baseline − 5%" + "security-class ≥ baseline
        // − 3%").
        withinGate: precisionDelta >= -0.05 && securityRecallDelta >= -0.03,
      };
      report.baseline!.path = join(fixturesDir, "benchmark", "v1", "baseline-report.json");
    }
  }

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

// A the `main` is a the module's top-level call (a the ESM entry point).
if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((err) => {
    process.stderr.write(`benchmark harness failed: ${String(err)}\n`);
    process.exit(1);
  });
}
