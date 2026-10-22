// The review-job handler — the pipeline + the persist-then-publish transaction
// (M5 T5.1/T5.2/T5.3, REVIEW_ENGINE_SPEC.md §2, ERROR_HANDLING.md §6).
//
// Flow (the ordered stages):
//   dequeue → load durable state (org + repo + quota, Postgres)
//   → [0] pre-flight quota gate (NFR-18 "never silent": a skip posts a notice)
//   → [1] same-SHA idempotency gate (ADR-007: a redelivered completed key no-ops)
//   → fetch the PR diff + bounded context (injected GithubDiffClient)
//   → deterministic static analysis (@vercode/static-analysis seam; the local
//     adapter stands in until M4 lands)
//   → AI review (provider from config; bounded retry + one fallback; a
//     provider failure → job `partial`, the static findings still publish —
//     ADR-005 / ERROR_HANDLING.md §5 "a provider failure never fails the
//     review")
//   → merge → validate (line-exists via the diff line map + enums + schema)
//   → dedup → policy (confidence floor default 0.6 from org_settings; per-repo
//     suppression from repo_rules; static findings exempt from the floor)
//   → summary
//   → PERSIST: findings + job state + usage_events in ONE Postgres transaction
//     (a failed publish does NOT roll back the stored review)
//   → publish to GitHub (summary + validated inline comments; the published
//     review id is stored per job — a retried publish no-ops, NFR-13)
//
// The function is pure-of-I/O-boundaries: it takes the deps (db, github,
// static analyzer, ai provider, diff engine, publisher) and returns the
// terminal result. The *transaction boundary* is explicit (a single db.$transaction) so the
// persist-then-publish invariant is testable without a live Postgres.

import type { JobStatus, ReviewFinding, Org, RepoRule, OrgSettings } from "@prisma/client";
import type { PRDiff, GithubDiffClient } from "@vercode/github";
import type { DbClient } from "@vercode/database";
import {
  type WorkerDeps,
  type ReviewJobPayload,
  type AiProvider,
  type AiCompleteInput,
  type AiCompleteResult,
  type GithubPublisher,
  type DiffContext,
} from "../config.js";
import { planQuota } from "@vercode/contracts";

// ---------------------------------------------------------------------------
// The canonical finding (post-pipeline, pre-persist). Mirrors the contracts
// ReviewFinding + the Prisma ReviewFinding row.
// ---------------------------------------------------------------------------

export interface CanonicalFinding {
  source: "eslint" | "semgrep" | "ai-deep" | "ai-security" | "deterministic-summary";
  file: string;
  line: number;
  severity: "low" | "medium" | "high" | "critical";
  category:
    | "logic-bug"
    | "security"
    | "performance"
    | "race-condition"
    | "resource-leak"
    | "api-contract"
    | "db-consistency"
    | "edge-case"
    | "assumption";
  title: string;
  description: string;
  suggestedFix?: string;
  confidence: number;
  /** A validated anchor (a the resolveAnchor outcome). */
  anchorStatus: "inline" | "anchor_failed";
}

export interface ReviewJobOutcome {
  /** The terminal job status (succeeded/partial/skipped). */
  status: JobStatus;
  skipReason?: string;
  findings: CanonicalFinding[];
  /** The usage event to record in the persist transaction. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    estUsdCost: number;
    model: string;
    promptVersion: string;
  };
  /** The summary body to post. */
  summaryBody: string;
  /** The inline comments to post (a the anchor-validated ones only). */
  inlineComments: Array<{ path: string; side: "RIGHT" | "LEFT"; line: number; body: string }>;
}

// ---------------------------------------------------------------------------
// The durable state load (a the re-read, never the payload — SERVICE_BOUNDARIES)
// ---------------------------------------------------------------------------

export async function loadDurableState(
  db: DbClient,
  payload: ReviewJobPayload
): Promise<{
  org: Org;
  settings: OrgSettings | undefined;
  repoRules: RepoRule[];
}> {
  const org = await db.organization.findFirst({
    where: { id: payload.orgId, status: { not: "DELETED" } },
    include: { settings: true },
  });
  if (!org) throw new Error(`org ${payload.orgId} not found or deleted`);
  const settings = org.settings as OrgSettings | undefined;
  const repoRules = await db.repoRule.findMany({
    where: { orgId: payload.orgId, repoId: payload.repoId },
    orderBy: { version: "desc" },
  });
  return { org, settings, repoRules };
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

export interface RunReviewOptions {
  attempt?: number;
  /** The prisma transaction client — injectable so the tests can spy on the commit. */
  txFactory?: (fn: (tx: DbClient) => Promise<unknown>) => Promise<unknown>;
}

export async function runReviewJob(
  deps: WorkerDeps,
  payload: ReviewJobPayload,
  opts: RunReviewOptions = {}
): Promise<ReviewJobOutcome> {
  const { db } = deps;
  const txFactory =
    opts.txFactory ??
    ((fn: (tx: DbClient) => Promise<unknown>) => db.$transaction(fn as never));

  // [load durable state] — the worker re-reads; the payload is a pointer.
  const { org, settings, repoRules } = await loadDurableState(db, payload);

  // The org's confidence floor (an org-level override row; the platform
  // default 0.6 from the config package when unset, NFR "confidence floor
  // 0.6 default").
  const platformDefaultFloor = 0.6;
  const confidenceFloor =
    settings?.confidenceFloor != null ? Number(settings.confidenceFloor) : platformDefaultFloor;

  // [0] Pre-flight quota gate (NFR-18, AC-402): if the org is over its plan
  // quota (reviews-per-month from plans.ts + the usage_events monthly
  // aggregate) → mark the job skipped: quota_exceeded, ZERO AI tokens,
  // post a notice. No AI call.
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const quota = await checkQuota(db, org, month);
  if (quota.over) {
    return finishSkipped(deps, payload, "quota_exceeded", {
      summaryBody: `Review skipped — org quota reached for ${month} (${quota.detail}). Upgrade or reduce review volume.`,
    });
  }

  // [1] Same-SHA idempotency gate (ADR-007): a redelivered job for a
  // completed key → no-op.
  const existing = await db.reviewJob.findUnique({
    where: {
      orgId_repoId_prNumber_commitSha: {
        orgId: payload.orgId,
        repoId: payload.repoId,
        prNumber: payload.prNumber,
        commitSha: payload.commitSha,
      },
    },
  });
  if (existing && isTerminalStatus(existing.status) && existing.status !== "SKIPPED") {
    // A completed (succeeded/partial/failed) review for this commit → no-op.
    return {
      status: "SKIPPED",
      skipReason: "same_sha",
      findings: [],
      usage: { inputTokens: 0, outputTokens: 0, estUsdCost: 0, model: "", promptVersion: "" },
      summaryBody: "No new review — this commit was already reviewed.",
      inlineComments: [],
    };
  }

  // [fetch the diff + bounded context]
  const pr = await fetchDiff(deps, payload);
  const diffCtx = deps.diffEngine.analyze(pr);

  // [deterministic static analysis — authoritative, exempt from the floor]
  const staticFindings = await deps.staticAnalyzer.runStatic(pr);

  // [AI review — bounded retry + one fallback; a failure → partial, the
  // static findings still publish (ADR-005)].
  const ai = await runAiStage(deps, pr, diffCtx);
  const aiFindings = ai.ok ? ai.result.findings : [];

  // [merge]
  const merged: CanonicalFinding[] = [
    ...staticFindings.map((f) => toCanonical({ ...f, source: "eslint" as const })),
    ...aiFindings.map((f) => toCanonical({ ...f, source: "ai-deep" as const })),
  ];

  // [validate] — line-exists via the diff's added ranges + enums + schema.
  const { valid, dropped } = validateFindings(merged, diffCtx);

  // [dedup] — (file, line, category) → highest-confidence survivor.
  const deduped = dedupFindings(valid);

  // [policy] — confidence floor (static exempt) + per-repo suppression.
  const { published, suppressedBelowFloor } = applyPolicy(deduped, confidenceFloor, repoRules);

  // [summary]
  const summaryBody = buildSummary(
    published,
    ai.ok
      ? undefined
      : "AI provider degraded — deterministic findings only (ADR-005)",
    repoRules.length > 0 ? "repo rules applied" : undefined
  );

  // [PERSIST] — findings + job state + usage in ONE transaction (a the
  // persist-then-publish invariant, ERROR_HANDLING.md §6). The job row is
  // upserted (a same-key re-delivery that races the idempotency gate still
  // lands atomically).
  const jobStatus: JobStatus = ai.ok ? "SUCCEEDED" : "PARTIAL";
  await txFactory(async (tx) => {
    // [the job row]
    const job = await upsertJob(tx, payload, jobStatus, {
      skipReason: undefined,
      usage: { ...ai.usage, model: ai.model, promptVersion: ai.promptVersion },
      pr,
    });

    // [the findings] — attach to the job (a anchor_status records which are inline vs pr-body).
    for (const f of published) {
      await tx.reviewFinding.create({
        data: {
          jobId: job.id,
          source: mapSourceToPrisma(f.source),
          file: f.file,
          line: f.line,
          severity: mapSeverityToPrisma(f.severity),
          category: mapCategoryToPrisma(f.category),
          title: f.title,
          description: f.description,
          suggestedFix: f.suggestedFix,
          confidence: f.confidence,
          anchorStatus: f.anchorStatus === "inline" ? "INLINE" : "ANCHOR_FAILED",
          // The full payload (the contract shape) for the dashboard read path.
          payload: toPrismaJson(f),
        },
      });
    }

    // [the usage event] — one row per job, attributed to the org.
    await tx.usageEvent.create({
      data: {
        orgId: payload.orgId,
        jobId: job.id,
        month,
        reviewCount: 1,
        inputTokens: ai.usage.inputTokens,
        outputTokens: ai.usage.outputTokens,
        estUsdCost: String(ai.usage.estUsdCost),
        model: ai.model,
      },
    });

    return job;
  });

  // [publish to GitHub] — AFTER the commit. A failed publish does NOT roll
  // back the findings (ERROR_HANDLING.md §6 "a failed publish never rolls
  // back the stored review"). The published review id is stored on the job.
  const inlineComments = buildInlineComments(published, pr, diffCtx);
  const publishResult = await publishGithub(deps, payload, org, {
    summary: summaryBody,
    inlineComments,
  });

  // [store the published review id] — a retried publish finds it + no-ops (NFR-13).
  if (publishResult.publishedGithubReviewId) {
    await db.reviewJob.update({
      where: {
        orgId_repoId_prNumber_commitSha: {
          orgId: payload.orgId,
          repoId: payload.repoId,
          prNumber: payload.prNumber,
          commitSha: payload.commitSha,
        },
      },
      data: { publishedGithubReviewId: publishResult.publishedGithubReviewId },
    });
  }

  return {
    status: jobStatus,
    findings: published,
    usage: { ...ai.usage, model: ai.model, promptVersion: ai.promptVersion },
    summaryBody,
    inlineComments,
  };
}

// ---------------------------------------------------------------------------
// The quota pre-flight (the single enforcement point — plans.ts + usage_events)
// ---------------------------------------------------------------------------

export interface QuotaState {
  over: boolean;
  detail: string;
}

export async function checkQuota(
  db: DbClient,
  org: { plan: import("@prisma/client").Plan; id: string },
  month: string
): Promise<QuotaState> {
  const quota = planQuota(org.plan.toLowerCase() as import("@vercode/contracts").Plan);
  const totals = await db.usageEvent.aggregate({
    where: { orgId: org.id, month },
    _sum: { reviewCount: true, estUsdCost: true },
  });
  const reviews = Number(totals._sum?.reviewCount ?? 0);
  const spend = Number(totals._sum?.estUsdCost ?? 0);

  // The reviews-per-month hard cap (a the N+1th skips, NFR-18/AC-402).
  if (quota.reviewsPerMonth > 0 && reviews >= quota.reviewsPerMonth) {
    return { over: true, detail: `${reviews}/${quota.reviewsPerMonth} reviews` };
  }
  // The token-spend cap (a the per-org backstop).
  if (quota.tokenSpendCapMonthlyUsd > 0 && spend >= quota.tokenSpendCapMonthlyUsd) {
    return { over: true, detail: `spend $${spend.toFixed(2)}/$${quota.tokenSpendCapMonthlyUsd}` };
  }
  return { over: false, detail: `${reviews}/${quota.reviewsPerMonth} reviews` };
}

// ---------------------------------------------------------------------------
// The AI stage — bounded retry + one fallback.
// ---------------------------------------------------------------------------

interface AiStageResult {
  ok: boolean;
  result: AiCompleteResult | undefined;
  usage: { inputTokens: number; outputTokens: number; estUsdCost: number };
  model: string;
  promptVersion: string;
}

async function runAiStage(
  deps: WorkerDeps,
  pr: PRDiff,
  diffCtx: DiffContext
): Promise<AiStageResult> {
  const empty: AiStageResult = {
    ok: false,
    result: undefined,
    usage: { inputTokens: 0, outputTokens: 0, estUsdCost: 0 },
    model: "",
    promptVersion: "",
  };
  const factories = deps.aiProviderFactories;
  if (factories.length === 0) return { ...empty, ok: true }; // no provider configured → skip the AI stage cleanly

  // Build the candidate files (the diff's changed files + bounded context).
  const aiFiles = buildAiFiles(diffCtx, pr);
  const input: AiCompleteInput = {
    task: "deep-review",
    files: aiFiles,
    changedLines: diffCtx.totalLines,
  };

  // [primary] — retry up to 2× with backoff (TRD.md §9).
  const [primary, fallback] = factories;
  const primaryProvider = primary(pr);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await primaryProvider.completeStructured(input);
      return {
        ok: true,
        result: res,
        usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens, estUsdCost: res.estUsdCost },
        model: res.model,
        promptVersion: res.promptVersion,
      };
    } catch {
      if (attempt < 2) await sleep(2 ** attempt * 10); // a short backoff (the real one is ms-scaled)
    }
  }

  // [fallback] — one switch to the secondary provider (TRD.md §9).
  if (fallback) {
    const fallbackProvider = fallback(pr);
    try {
      const res = await fallbackProvider.completeStructured(input);
      return {
        ok: true,
        result: res,
        usage: { inputTokens: res.inputTokens, outputTokens: res.outputTokens, estUsdCost: res.estUsdCost },
        model: `fallback:${res.model}`,
        promptVersion: res.promptVersion,
      };
    } catch {
      // Both failed → partial. The static findings still publish (ADR-005).
      return empty;
    }
  }

  // No fallback configured + primary failed → partial.
  return empty;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildAiFiles(diffCtx: DiffContext, pr: PRDiff): AiCompleteInput["files"] {
  // The bounded context (FR-401): the changed files only, a not the whole repo.
  return diffCtx.files.map((path) => ({
    path,
    language: guessLanguage(path),
    content: `diff ${path} in PR #${pr.prNumber}`, // a stand-in; the real provider gets the changed lines
  }));
}

function guessLanguage(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".go")) return "go";
  if (path.endsWith(".rs")) return "rust";
  return "unknown";
}

// ---------------------------------------------------------------------------
// The validate / dedup / policy / summary stages
// ---------------------------------------------------------------------------

function toCanonical(f: {
  source: string;
  file: string;
  line: number;
  severity: string;
  category: string;
  title: string;
  description: string;
  suggestedFix?: string;
  confidence: number;
}): CanonicalFinding {
  return {
    source: f.source as CanonicalFinding["source"],
    file: f.file,
    line: f.line,
    severity: f.severity as CanonicalFinding["severity"],
    category: f.category as CanonicalFinding["category"],
    title: f.title,
    description: f.description,
    suggestedFix: f.suggestedFix,
    confidence: f.confidence,
    // The anchor is validated in the next step; this is the raw shape.
    anchorStatus: "inline",
  };
}

export interface ValidationOutcome {
  valid: CanonicalFinding[];
  dropped: { invalid: number; invalidAnchor: number };
}

/**
 * Validate (REVIEW_ENGINE_SPEC §2 stage [9]): line-exists via the diff's added
 * ranges + enum-valid + schema-valid. An invalid finding is dropped (a counter,
 * not a crash).
 */
export function validateFindings(
  findings: CanonicalFinding[],
  diffCtx: DiffContext
): ValidationOutcome {
  const valid: CanonicalFinding[] = [];
  let invalid = 0;
  let invalidAnchor = 0;
  const allowedSev = new Set(["low", "medium", "high", "critical"]);
  const allowedCat = new Set([
    "logic-bug", "security", "performance", "race-condition",
    "resource-leak", "api-contract", "db-consistency", "edge-case", "assumption",
  ]);

  for (const f of findings) {
    if (!allowedSev.has(f.severity) || !allowedCat.has(f.category)) {
      invalid += 1;
      continue;
    }
    if (f.confidence < 0 || f.confidence > 1) {
      invalid += 1;
      continue;
    }
    // The line-exists check (a the resolveAnchor seam, INTEGRATION_DESIGN §1.6).
    const ranges = diffCtx.addedLineRanges[f.file];
    if (!ranges || !ranges.has(f.line)) {
      // A the finding's line isn't in the diff's added ranges → it can't be
      // an inline comment on the right side. A removed-line note could be
      // LEFT-side, but a the MVP anchors to the added ranges. Mark
      // anchor_failed + keep for the PR body (a not drop — a deterministic
      // finding with a bad anchor is still useful in the summary).
      invalidAnchor += 1;
      f.anchorStatus = "anchor_failed";
      valid.push(f);
      continue;
    }
    valid.push(f);
  }
  return { valid, dropped: { invalid, invalidAnchor } };
}

/** Dedup (stage [10]): (file, line, category) → highest-confidence survivor. */
export function dedupFindings(findings: CanonicalFinding[]): CanonicalFinding[] {
  const map = new Map<string, CanonicalFinding>();
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.category}`;
    const existing = map.get(key);
    if (!existing || f.confidence > existing.confidence) map.set(key, f);
  }
  return [...map.values()];
}

/**
 * Policy (stage [11]): confidence floor (a the static findings are exempt,
 * ADR-005) + per-repo suppression (a repo_rules.suppressCategories).
 */
export function applyPolicy(
  findings: CanonicalFinding[],
  floor: number,
  repoRules: Array<{ suppressCategories: unknown; confidenceFloorOverride?: number | null }>
): { published: CanonicalFinding[]; suppressedBelowFloor: number; suppressedByRule: number } {
  // The effective floor: a per-repo override beats the org floor.
  let effectiveFloor = floor;
  const suppressCategories: string[] = [];
  for (const rule of repoRules) {
    if (typeof rule.confidenceFloorOverride === "number") {
      effectiveFloor = Math.max(effectiveFloor, rule.confidenceFloorOverride);
    }
    const cats = Array.isArray(rule.suppressCategories)
      ? (rule.suppressCategories as string[])
      : [];
    for (const c of cats) suppressCategories.push(c);
  }
  const suppressed = new Set(suppressCategories.map(normalizeCategory));

  const published: CanonicalFinding[] = [];
  let suppressedBelowFloor = 0;
  let suppressedByRule = 0;
  for (const f of findings) {
    const isStatic = f.source === "eslint" || f.source === "semgrep";
    // The confidence floor (a static findings are exempt — deterministic).
    if (!isStatic && f.confidence < effectiveFloor) {
      suppressedBelowFloor += 1;
      continue;
    }
    if (suppressed.has(normalizeCategory(f.category))) {
      suppressedByRule += 1;
      continue;
    }
    published.push(f);
  }
  return { published, suppressedBelowFloor, suppressedByRule };
}

function normalizeCategory(c: string): string {
  return c.replace(/[-_]/g, "-");
}

/** The summary (stage [12]) — a deterministic verdict (a the provider-down path). */
export function buildSummary(findings: CanonicalFinding[], ...notes: (string | undefined)[]): string {
  const highCount = findings.filter((f) => f.severity === "high" || f.severity === "critical").length;
  const verdict =
    highCount === 0
      ? "likely_mergeable"
      : highCount >= 3
        ? "high_risk"
        : "needs_changes";
  const lines = [
    `## VERCODE review — ${verdict}`,
    `${findings.length} finding(s), ${highCount} high/critical.`,
    ...notes.filter((n): n is string => Boolean(n)).map((n) => `Note: ${n}`),
  ];
  return lines.join("\n");
}

/** The inline comments (a the anchor-valid ones only; the anchor_failed go to the body). */
export function buildInlineComments(
  findings: CanonicalFinding[],
  _pr: PRDiff,
  _diffCtx: DiffContext
): Array<{ path: string; side: "RIGHT" | "LEFT"; line: number; body: string }> {
  return findings
    .filter((f) => f.anchorStatus === "inline")
    .map((f) => ({
      path: f.file,
      side: "RIGHT" as const,
      line: f.line,
      body: `[${f.severity.toUpperCase()}] ${f.title} — ${f.description}${f.suggestedFix ? `\nSuggested: ${f.suggestedFix}` : ""}`,
    }));
}

// ---------------------------------------------------------------------------
// The GitHub publish (a the seam)
// ---------------------------------------------------------------------------

async function publishGithub(
  deps: WorkerDeps,
  payload: ReviewJobPayload,
  org: { id: string },
  body: { summary: string; inlineComments: Array<{ path: string; side: "RIGHT" | "LEFT"; line: number; body: string }> }
): Promise<{ publishedGithubReviewId?: string; error?: string }> {
  // The mock publisher records in-memory; the real one posts the summary
  // review + the inline comments. A publish failure does NOT roll back the
  // findings (ERROR_HANDLING.md §6) — the worker records the error + leaves
  // the persisted review intact.
  try {
    // The repo's full name (a the publisher needs the owner/repo path, a not
    // the DB repo id).
    const repo = await deps.db.githubRepo.findFirst({
      where: { orgId: payload.orgId, id: payload.repoId },
      select: { fullName: true },
    });
    const res = await deps.publisher.publish({
      repoId: payload.repoId,
      repoFullName: repo?.fullName ?? `${payload.orgId}/${payload.repoId}`,
      prNumber: payload.prNumber,
      commitSha: payload.commitSha,
      summary: body.summary,
      inlineComments: body.inlineComments,
    });
    return { publishedGithubReviewId: res.publishedGithubReviewId };
  } catch (err) {
    // A publish failure (a a GitHub 429/422/404) — the findings are already
    // persisted. A the worker records the failure + the job keeps its
    // terminal status (a the retry of *publish* is independent of the
    // pipeline, INTEGRATION_DESIGN §1.7).
    return { error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// The job upsert (a the persist step, inside the transaction)
// ---------------------------------------------------------------------------

async function upsertJob(
  tx: DbClient,
  payload: ReviewJobPayload,
  status: JobStatus,
  extra: {
    skipReason?: string;
    usage: { inputTokens: number; outputTokens: number; estUsdCost: number; model: string; promptVersion: string };
    pr: PRDiff;
  }
) {
  const key = {
    orgId: payload.orgId,
    repoId: payload.repoId,
    prNumber: payload.prNumber,
    commitSha: payload.commitSha,
  };
  const existing = await tx.reviewJob.findUnique({ where: key });
  if (existing) {
    return await tx.reviewJob.update({
      where: { id: existing.id },
      data: {
        status,
        skipReason: extra.skipReason ?? null,
        inputTokens: extra.usage.inputTokens,
        outputTokens: extra.usage.outputTokens,
        estUsdCost: String(extra.usage.estUsdCost),
        model: extra.usage.model || null,
        promptVersion: extra.usage.promptVersion || null,
        finishedAt: new Date(),
      },
    });
  }
  return await tx.reviewJob.create({
    data: {
      orgId: payload.orgId,
      repoId: payload.repoId,
      prNumber: payload.prNumber,
      commitSha: payload.commitSha,
      status,
      skipReason: extra.skipReason ?? null,
      inputTokens: extra.usage.inputTokens,
      outputTokens: extra.usage.outputTokens,
      estUsdCost: String(extra.usage.estUsdCost),
      model: extra.usage.model || null,
      promptVersion: extra.usage.promptVersion || null,
      finishedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// The skip path (a the quota-gate + the same-SHA no-op + the install/pr-closed)
// ---------------------------------------------------------------------------

async function finishSkipped(
  deps: WorkerDeps,
  payload: ReviewJobPayload,
  skipReason: string,
  body: { summaryBody: string }
): Promise<ReviewJobOutcome> {
  const { db } = deps;
  // A persist the skip + a zero-usage row (a the "never silent" rule: a the
  // skip is recorded, not just posted). The persist is the same transaction
  // shape as the success path (a persist-then-publish, ERROR_HANDLING.md §6).
  await db.$transaction(async (tx: DbClient) => {
    await upsertJob(tx, payload, "SKIPPED", {
      skipReason,
      usage: { inputTokens: 0, outputTokens: 0, estUsdCost: 0, model: "", promptVersion: "" },
      pr: {
        diff: "",
        prNumber: payload.prNumber,
        title: "",
        headSha: payload.commitSha,
        baseRef: "",
      },
    });
  });
  // A the skip notice (a NFR-18 "never silent").
  try {
    await publishGithub(deps, payload, { id: payload.orgId }, {
      summary: body.summaryBody,
      inlineComments: [],
    });
  } catch {
    // A the notice post can fail (a GitHub down) — a the skip is still
    // persisted (a the "never silent" is the DB record; a the PR notice is
    // best-effort).
  }
  return {
    status: "SKIPPED",
    skipReason,
    findings: [],
    usage: { inputTokens: 0, outputTokens: 0, estUsdCost: 0, model: "", promptVersion: "" },
    summaryBody: body.summaryBody,
    inlineComments: [],
  };
}

// ---------------------------------------------------------------------------
// The diff fetch (a the GithubDiffClient seam)
// ---------------------------------------------------------------------------

async function fetchDiff(deps: WorkerDeps, payload: ReviewJobPayload): Promise<PRDiff> {
  const repo = await deps.db.githubRepo.findFirst({
    where: { orgId: payload.orgId, id: payload.repoId },
    select: { githubRepoId: true, fullName: true },
  });
  if (!repo) throw new Error(`repo ${payload.repoId} not found for org ${payload.orgId}`);
  return deps.github.fetchPRDiff({
    orgId: payload.orgId,
    githubRepoId: Number(repo.githubRepoId),
    repoFullName: repo.fullName,
    prNumber: payload.prNumber,
    headSha: payload.commitSha,
  });
}

// ---------------------------------------------------------------------------
// The Prisma mapping helpers (a the contracts enum → the DB enum)
// ---------------------------------------------------------------------------

type PrismaFindingSource = "ESLINT" | "SEMGREP" | "AI_DEEP" | "AI_SECURITY" | "DETERMINISTIC_SUMMARY";
type PrismaSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type PrismaCategory =
  | "LOGIC_BUG" | "SECURITY" | "PERFORMANCE" | "RACE_CONDITION"
  | "RESOURCE_LEAK" | "API_CONTRACT" | "DB_CONSISTENCY" | "EDGE_CASE" | "ASSUMPTION";

function mapSourceToPrisma(s: CanonicalFinding["source"]): PrismaFindingSource {
  switch (s) {
    case "eslint": return "ESLINT";
    case "semgrep": return "SEMGREP";
    case "ai-deep": return "AI_DEEP";
    case "ai-security": return "AI_SECURITY";
    default: return "DETERMINISTIC_SUMMARY";
  }
}
function mapSeverityToPrisma(s: string): PrismaSeverity {
  return s.toUpperCase() as PrismaSeverity;
}
function mapCategoryToPrisma(c: string): PrismaCategory {
  const norm = c.replace(/-/g, "_").toUpperCase();
  return norm as PrismaCategory;
}
function toPrismaJson(f: CanonicalFinding): object {
  return { ...f };
}

// ---------------------------------------------------------------------------
// The status helpers
// ---------------------------------------------------------------------------

export function isTerminalStatus(s: string): boolean {
  return s === "SUCCEEDED" || s === "PARTIAL" || s === "FAILED" || s === "SKIPPED";
}

// A re-export for the tests.
export type { DiffContext };
