// ---------------------------------------------------------------------------
// Local adapters — the single-file stand-in for the M4 packages that have NOT
// landed yet (@vercode/ai-providers, T4.3).
//
// TODO(T5.1): @vercode/diff-engine + @vercode/static-analysis have MERGED —
// the worker now imports them directly (see src/jobs/review.ts:
// parseUnifiedDiff/resolveAnchor from @vercode/diff-engine; runStaticAnalysis
// from @vercode/static-analysis). The only remaining seam is the AI provider,
// below. When @vercode/ai-providers lands:
//   - delete MockAiProvider + FailingAiProvider (the real adapters
//     implement the AiProvider/AiProviderFactory interfaces in src/config.ts),
//   - delete this file (the github-mock diff client + publisher are separate
//     dev-stack seams, not M4 packages — they stay in
//     src/adapters/github-mock.ts until the Octokit client lands).
//
// The mock AI provider is deterministic: given a change set, it produces a
// small, stable set of findings anchored to the first added line of each
// candidate file (guaranteed to pass resolveAnchor). Zero real token cost.
// The provider is selected via the config (AI_DEFAULT_PROVIDER=mock is the
// dev default, TRD.md §18 "a mock-AI provider for deterministic runs").
// ---------------------------------------------------------------------------

import type {
  AiProvider,
  AiProviderFactory,
  AiCompleteInput,
  AiCompleteResult,
} from "../config.js";
import type { ChangeSet } from "@vercode/diff-engine";

export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  private readonly changeSet: ChangeSet;

  /** The provider is constructed per-review with the parsed change set. */
  constructor(changeSet: ChangeSet) {
    this.changeSet = changeSet;
  }

  async completeStructured(input: AiCompleteInput): Promise<AiCompleteResult> {
    const files = this.changeSet.files
      .filter((f) => !f.isBinary)
      .slice(0, 3);
    const findings = files.map((f, i) => ({
      file: f.path,
      line: f.addedLines[0] ?? 1,
      severity: (i === 0 ? "high" : "medium") as "high" | "medium",
      category: (i === 0 ? "security" : "logic-bug") as "security" | "logic-bug",
      title: `${input.task}: ${f.path}`,
      description: `Mock AI provider flagged ${f.path} during the ${input.task} pass (a deterministic stand-in until @vercode/ai-providers lands).`,
      suggestedFix: "Address the flagged concern.",
      confidence: 0.9 - i * 0.05,
    }));
    return {
      findings,
      // The mock accounts a nominal cost (the real provider reads the
      // config's rate table, TRD.md §9 "est_usd_cost from the rate table").
      inputTokens: files.length * 50,
      outputTokens: findings.length * 80,
      estUsdCost: 0.001 * Math.max(1, files.length),
      model: "mock-1",
      promptVersion: "mock-v0",
    };
  }
}

/** The mock provider factory (the AiProviderFactory seam). */
export const mockAiProviderFactory: AiProviderFactory = (changeSet) =>
  new MockAiProvider(changeSet);

// ---------------------------------------------------------------------------
// A provider that simulates "down" — used by the tests to exercise the
// partial-path (a provider failure → job partial, deterministic findings
// still publish, ADR-005 / ERROR_HANDLING.md §5).
// ---------------------------------------------------------------------------

export class FailingAiProvider implements AiProvider {
  readonly name = "failing";
  constructor(_changeSet?: ChangeSet) {}
  async completeStructured(_input: AiCompleteInput): Promise<AiCompleteResult> {
    throw new Error("AI provider unavailable (simulated outage)");
  }
}

export const failingAiProviderFactory: AiProviderFactory = () => new FailingAiProvider();
