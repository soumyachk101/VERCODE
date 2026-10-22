// The review-job handler — the pipeline + the persist-then-publish
// transaction (M5 T5.1/T5.2/T5.3, REVIEW_ENGINE_SPEC.md §2,
// ERROR_HANDLING.md §6).
//
// Flow (the ordered stages):
//   dequeue → load durable state (org + quota, Postgres; the payload is a
//   pointer, SERVICE_BOUNDARIES.md "never trust the payload for authz")
//   → [0] pre-flight quota gate (NFR-18 "never silent": a skip posts a notice;
//         ZERO AI tokens consumed, AC-402)
//   → [1] same-SHA idempotency gate (ADR-007: a redelivered completed key no-ops)
//   → fetch the PR diff (the injected GithubDiffClient; the mock in dev)
//   → parse it into a ChangeSet (@vercode/diff-engine)
//   → deterministic static analysis (@vercode/static-analysis, ADR-005:
//     authoritative + exempt from the confidence floor)
//   → AI review (the @vercode/ai-providers seam; the local mock stands in
//     until it lands. Bounded retry + one fallback; a provider failure →
//     job `partial`, the static findings still publish)
//   → merge → validate (line-exists via resolveAnchor, enums, schema)
//   → dedup → policy (confidence floor 0.6 default from org_settings;
//     per-repo suppression from repo_rules)
//   → summary
//   → PERSIST: findings + job state + usage_events in ONE Postgres transaction
//     (a failed publish does NOT roll back the stored review)
//   → publish to GitHub (summary + validated inline comments; the published
//     review id is stored on the job — a retried publish no-ops, NFR-13)
//
// The function takes the injected deps (db, github, providers, publisher) and
// returns the terminal result; the *transaction boundary* is an explicit
// $transaction so the persist-then-publish invariant is testable without a
// live Postgres.

import type {
  JobStatus,
  Organization,
  OrgSettings,
  Plan,
  RepoRule,
  Prisma,
} from "@prisma/client";
import type { PRDiff } from "@vercode/github";
import type { DbClient } from "@vercode/database";
import {
  parseUnifiedDiff,
  resolveAnchor,
  type ChangeSet,
} from "@vercode/diff-engine";
import { runStaticAnalysis, type StaticFinding } from "@vercode/static-analysis";
import { planQuota, type Plan as ContractPlan } from "@vercode/contracts";
import {
  type WorkerDeps,
  type ReviewJobPayload,
  type AiCompleteInput,
  type AiCompleteResult,
} from "../config.js";

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
  /** A the validated anchor outcome (INLINE = a GitHub inline comment; ANCHOR_FAILED = a PR-body section). */
  anchorStatus: "inline" | "anchor_failed";
}

export interface ReviewJobOutcome {
  /** The terminal job status (succeeded/partial/skipped). */
  status: JobStatus;
  skipReason?: string;
  findings: CanonicalFinding[];
  /** The usage event recorded in the persist transaction. */
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
// The durable state load (a the re-read, never the payload)
// ---------------------------------------------------------------------------

export interface DurableState {
  org: Organization;
  settings: OrgSettings | undefined;
  repoRules: RepoRule[];
}

export async function loadDurableState(db: DbClient, payload: ReviewJobPayload): Promise<DurableState> {
  const org = await db.organization.findFirst({
    where: { id: payload.orgId, status: { not: "DELETED" } },
    include: { settings: true },
  });
  if (!org) throw new Error(`org ${payload.orgId} not found or deleted`);
  // The settings relation is a 1:1 (org_settings.org_id is unique) — an
  // array-shaped include returns at most one row.
  const settings = (org.settings as unknown as OrgSettings[] | OrgSettings | null)?.[0] as
    | OrgSettings
    | undefined;
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
  /** A the prisma transaction boundary (injected so tests can record the commit). */
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
    ((fn: (tx: unknown) => Promise<unknown>) =>
      db.$transaction((tx) => fn(tx as unknown) as Promise<unknown>));

  // [load the durable state] — the payload is a pointer.
  const { org, settings, repoRules } = await loadDurableState(db, payload);

  // A the org's confidence floor (an org-level override row; the platform
  // default 0.6 when unset, TRD.md "confidence floor 0.6 default from
  // org_settings").
  const confidenceFloor =
    settings?.confidenceFloor != null ? Number(settings.confidenceFloor) : 0.6;

  // [0] Pre-flight quota gate (NFR-18, AC-402): if the org is over its plan's
  // quota (plans.ts quota + the usage_events monthly aggregate) → skipped
  // quota_exceeded, ZERO AI tokens consumed, a notice posted.
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const quota = await checkQuotaPlan(db, org.id, org.plan.toLowerCase() as ContractPlan, month);
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
  if (existing && (existing.status === "SUCCEEDED" || existing.status === "PARTIAL")) {
    return {
      status: "SKIPPED",
      skipReason: "same_sha",
      findings: [],
      usage: { inputTokens: 0, outputTokens: 0, estUsdCost: 0, model: "", promptVersion: "" },
      summaryBody: "No new review — this commit was already reviewed.",
      inlineComments: [],
    };
  }

  // [fetch the diff + parse it]
  const pr = await fetchDiff(deps, payload);
  const changeSet = parseUnifiedDiff(pr.diff);

  // [deterministic static analysis] — a authoritative, exempt from the floor.
  const staticResult = runStaticAnalysis(staticFileMap(changeSet, pr));
  const staticFindings = staticResult.findings;

  // [AI review] — a bounded retry + one fallback; a failure → partial.
  const ai = await runAiStage(deps, changeSet);

  // [merge]
  const merged: CanonicalFinding[] = [
    ...staticFindings.map((f) => toCanonical(f)),
    ...ai.ok && ai.result ? ai.result.findings.map((f) => toCanonical({ ...f, source: "ai-deep" })) : [],
  ];

  // [validate] — a line-exists via resolveAnchor + enums + schema.
  const { valid } = validateFindings(merged, changeSet);

  // [dedup] — a (file, line, category) → highest-confidence survivor.
  const deduped = dedupFindings(valid);

  // [policy] — a confidence floor (static exempt) + per-repo suppression.
  const { published } = applyPolicy(deduped, confidenceFloor, repoRules);

  // [summary]
  const summaryBody = buildSummary(
    published,
    ai.ok ? undefined : "AI provider degraded — deterministic findings only (ADR-005)"
  );

  // [PERSIST] — a findings + job state + usage in ONE transaction (a the
  // persist-then-publish invariant, ERROR_HANDLING.md §6).
  const jobStatus: JobStatus = ai.ok ? "SUCCEEDED" : "PARTIAL";
  await txFactory(async (tx) => {
    const t = tx as DbClient;
    const job = await upsertJob(t, payload, jobStatus, {
      usage: {
        inputTokens: ai.usage.inputTokens,
        outputTokens: ai.usage.outputTokens,
        estUsdCost: ai.usage.estUsdCost,
        model: ai.model,
        promptVersion: ai.promptVersion,
      },
    });
    for (const f of published) {
      await t.reviewFinding.create({
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
          payload: JSON.parse(JSON.stringify(f)) as Prisma.InputJsonValue,
        },
      });
    }
    // A the usage event — a one row per job, attributed to the org.
    await t.usageEvent.create({
      data: {
        orgId: payload.orgId,
        jobId: job.id,
        month,
        reviewCount: 1,
        inputTokens: ai.usage.inputTokens,
        outputTokens: ai.usage.outputTokens,
        estUsdCost: String(ai.usage.estUsdCost),
        model: ai.model || null,
      },
    });
  });

  // [publish to GitHub] — a AFTER the commit. A failed publish does NOT roll
  // back the findings (ERROR_HANDLING.md §6); the published review id is
  // stored on the job (a retry no-ops, NFR-13).
  const inlineComments = buildInlineComments(published);
  const publishResult = await publishGithub(deps, payload, {
    summary: summaryBody,
    inlineComments,
  });

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
// The quota pre-flight (a the single enforcement point — plans.ts + usage_events)
// ---------------------------------------------------------------------------

export interface QuotaState {
  over: boolean;
  detail: string;
}

/** The org-level quota check (a the plan is the contracts Plan enum). */
export async function checkQuotaPlan(
  db: DbClient,
  orgId: string,
  plan: ContractPlan,
  month: string
): Promise<QuotaState> {
  const quota = planQuota(plan);
  const totals = await db.usageEvent.aggregate({
    where: { orgId, month },
    _sum: { reviewCount: true, estUsdCost: true },
  });
  const reviews = Number(totals._sum?.reviewCount ?? 0);
  const spend = Number(totals._sum?.estUsdCost ?? 0);

  // A the reviews-per-month hard cap (a the N+1th skips, NFR-18/AC-402).
  if (quota.reviewsPerMonth > 0 && reviews >= quota.reviewsPerMonth) {
    return { over: true, detail: `${reviews}/${quota.reviewsPerMonth} reviews` };
  }
  // A the token-spend cap (a the per-org backstop).
  if (quota.tokenSpendCapMonthlyUsd > 0 && spend >= quota.tokenSpendCapMonthlyUsd) {
    return { over: true, detail: `spend $${spend.toFixed(2)} / $${quota.tokenSpendCapMonthlyUsd}` };
  }
  return { over: false, detail: `${reviews}/${quota.reviewsPerMonth} reviews` };
}

// ---------------------------------------------------------------------------
// The AI stage — a bounded retry + one fallback (TRD.md §9)
// ---------------------------------------------------------------------------

interface AiStageResult {
  ok: boolean;
  result?: AiCompleteResult;
  usage: { inputTokens: number; outputTokens: number; estUsdCost: number };
  model: string;
  promptVersion: string;
}

async function runAiStage(deps: WorkerDeps, changeSet: ChangeSet): Promise<AiStageResult> {
  const empty: AiStageResult = {
    ok: false,
    usage: { inputTokens: 0, outputTokens: 0, estUsdCost: 0 },
    model: "",
    promptVersion: "",
  };
  const factories = deps.aiProviderFactories;
  if (factories.length === 0) return { ...empty, ok: true }; // no provider configured

  const aiFiles = changeSet.files
    .filter((f) => !f.isBinary)
    .map((f) => ({ path: f.path, language: guessLanguage(f.path) }));
  const input: AiCompleteInput = {
    task: "deep-review",
    files: aiFiles,
    changedLines: changeSet.files.reduce((n, f) => n + f.changedLines, 0),
  };

  const [primary, fallback] = factories;
  const primaryProvider = primary(changeSet);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await primaryProvider.completeStructured(input);
      return {
        ok: true,
        result: res,
        usage: {
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          estUsdCost: res.estUsdCost,
        },
        model: res.model,
        promptVersion: res.promptVersion,
      };
    } catch {
      if (attempt < 2) await sleep(2 ** attempt * 10);
    }
  }

  // A one switch to the secondary provider (TRD.md §9 "bounded retry, then
  // fall back … one switch").
  if (fallback) {
    try {
      const res = await fallback(changeSet).completeStructured(input);
      return {
        ok: true,
        result: res,
        usage: {
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          estUsdCost: res.estUsdCost,
        },
        model: `fallback:${res.model}`,
        promptVersion: res.promptVersion,
      };
    } catch {
      return empty; // both failed → a partial (a static findings still publish).
    }
  }
  return empty;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function guessLanguage(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".go")) return "go";
  if (path.endsWith(".rs")) return "rust";
  return "unknown";
}

// A the static-analysis package wants a path → content map. The diff string
// is all the worker has at this stage (a the full head-SHA contents come
// with the bounded-context fetch, FR-401 — a later seam). We feed each
// changed file its hunk lines (a the diff carries the added/removed content)
// so the pattern rules still run over the changed lines.
function staticFileMap(changeSet: ChangeSet, pr: PRDiff): Map<string, string> {
  const map = new Map<string, string>();
  const diffByFile = diffTextByFile(pr.diff);
  for (const f of changeSet.files) {
    if (f.isBinary) continue;
    map.set(f.path, diffByFile.get(f.path) ?? "");
  }
  return map;
}

/** A split the unified diff text into per-file blocks (a simple split). */
function diffTextByFile(diff: string): Map<string, string> {
  const out = new Map<string, string>();
  const blocks = diff.split(/^diff --git /m).filter((b) => b.length > 0);
  for (const block of blocks) {
    const header = block.match(/^a\/(\S+) b\/(\S+)/);
    if (header) out.set(header[2], block);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The validate / dedup / policy / summary stages
// ---------------------------------------------------------------------------

function toCanonical(f: {
  source?: StaticFinding["source"] | string;
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
    source: (f.source ?? "ai-deep") as CanonicalFinding["source"],
    file: f.file,
    line: f.line,
    severity: f.severity as CanonicalFinding["severity"],
    category: f.category as CanonicalFinding["category"],
    title: f.title,
    description: f.description,
    suggestedFix: f.suggestedFix,
    confidence: f.confidence,
    anchorStatus: "inline",
  };
}

export interface ValidationOutcome {
  valid: CanonicalFinding[];
  dropped: { invalid: number; invalidAnchor: number };
}

/**
 * Validate (REVIEW_ENGINE_SPEC §2 stage [9]): line-exists via resolveAnchor
 * (+ enums + confidence range). A the anchor_failed findings are KEPT (a
 * demoted to the PR body, INTEGRATION_DESIGN §1.6); a the schema-invalid are
 * dropped.
 */
export function validateFindings(
  findings: CanonicalFinding[],
  changeSet: ChangeSet
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
    if (Number.isNaN(f.confidence) || f.confidence < 0 || f.confidence > 1) {
      invalid += 1;
      continue;
    }
    // A the line-exists check (INTEGRATION_DESIGN §1.6 "anchor validation
    // precedes publication"). A RIGHT-side line must be in the diff's added
    // ranges; a the demotion, not a drop, on a miss (a the PR-body section).
    const resolved = resolveAnchor(changeSet, f.file, f.line, "RIGHT");
    if (!resolved.ok) {
      invalidAnchor += 1;
      f.anchorStatus = "anchor_failed";
    }
    valid.push(f);
  }
  return { valid, dropped: { invalid, invalidAnchor } };
}

/** A dedup (stage [10]): (file, line, category) → highest-confidence survivor. */
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
 * Policy (stage [11]): a the confidence floor (a the static findings are
 * exempt, ADR-005) + a the per-repo suppression (a the
 * repo_rules.suppressCategories + a the confidenceFloorOverride).
 */
export function applyPolicy(
  findings: CanonicalFinding[],
  floor: number,
  repoRules: Array<{ suppressCategories: unknown; confidenceFloorOverride?: number | null }>
): { published: CanonicalFinding[]; suppressedBelowFloor: number; suppressedByRule: number } {
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
    // A the static findings are deterministic → a exempt from the floor.
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

/** A the summary (stage [12]) — a the deterministic verdict (a works provider-down too). */
export function buildSummary(
  findings: CanonicalFinding[],
  ...notes: (string | undefined)[]
): string {
  const highCount = findings.filter((f) => f.severity === "high" || f.severity === "critical").length;
  const verdict =
    highCount === 0 ? "likely_mergeable" : highCount >= 3 ? "high_risk" : "needs_changes";
  return [
    `## VERCODE review — ${verdict}`,
    `${findings.length} finding(s), ${highCount} high/critical.`,
    ...notes.filter((n): n is string => Boolean(n)).map((n) => `Note: ${n}`),
  ].join("\n");
}

/** A the inline comments (a the anchor-valid ones only; a the anchor_failed go to the PR body). */
export function buildInlineComments(
  findings: CanonicalFinding[]
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
// A the GitHub publish (a the seam; a failed publish does NOT roll back)
// ---------------------------------------------------------------------------

async function publishGithub(
  deps: WorkerDeps,
  payload: ReviewJobPayload,
  body: { summary: string; inlineComments: Array<{ path: string; side: "RIGHT" | "LEFT"; line: number; body: string }> }
): Promise<{ publishedGithubReviewId?: string; error?: string }> {
  try {
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
    // A GitHub 429/422/404 (INTEGRATION_DESIGN §1.7): a the findings are
    // already persisted (a the invariant). A the publish retry is
    // independent of the pipeline.
    return { error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// A the job upsert (a the persist step, inside the transaction)
// ---------------------------------------------------------------------------

async function upsertJob(
  tx: DbClient,
  payload: ReviewJobPayload,
  status: JobStatus,
  extra: {
    skipReason?: string;
    usage: { inputTokens: number; outputTokens: number; estUsdCost: number; model: string; promptVersion: string };
  }
) {
  const whereUnique = {
    orgId_repoId_prNumber_commitSha: {
      orgId: payload.orgId,
      repoId: payload.repoId,
      prNumber: payload.prNumber,
      commitSha: payload.commitSha,
    },
  };
  const existing = await tx.reviewJob.findUnique({ where: whereUnique });
  const data = {
    status,
    skipReason: extra.skipReason ?? null,
    inputTokens: extra.usage.inputTokens,
    outputTokens: extra.usage.outputTokens,
    estUsdCost: String(extra.usage.estUsdCost),
    model: extra.usage.model || null,
    promptVersion: extra.usage.promptVersion || null,
    finishedAt: new Date(),
  };
  if (existing) {
    const updated = await tx.reviewJob.update({ where: { id: existing.id }, data });
    return { id: existing.id, ...(updated as object) } as { id: string };
  }
  return await tx.reviewJob.create({
    data: {
      orgId: payload.orgId,
      repoId: payload.repoId,
      prNumber: payload.prNumber,
      commitSha: payload.commitSha,
      ...data,
    },
  });
}

// ---------------------------------------------------------------------------
// A the skip path (a the quota-gate + a the install/pr-closed; a the same-SHA
// no-op is inline above)
// ---------------------------------------------------------------------------

async function finishSkipped(
  deps: WorkerDeps,
  payload: ReviewJobPayload,
  skipReason: string,
  body: { summaryBody: string }
): Promise<ReviewJobOutcome> {
  const { db } = deps;
  // A persist the skip (a the "never silent" rule, NFR-18): a the skip is a
  // terminal, recorded state. A the same transaction shape as the success
  // path (a persist-then-publish).
  await db.$transaction((tx) =>
    upsertJob(tx, payload, "SKIPPED", {
      skipReason,
      usage: { inputTokens: 0, outputTokens: 0, estUsdCost: 0, model: "", promptVersion: "" },
    })
  );
  // A the skip notice (a NFR-18 "never silent" — a posted notice on the PR).
  try {
    await publishGithub(deps, payload, {
      summary: body.summaryBody,
      inlineComments: [],
    });
  } catch {
    // A the notice post can fail (a GitHub down) — a the skip is still
    // persisted; a the DB record is authoritative (ERROR_HANDLING §10).
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
// A the diff fetch (a the GithubDiffClient seam)
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
// A the Prisma enum mapping helpers (a the contracts enum → a the DB enum)
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
  return c.replace(/-/g, "_").toUpperCase() as PrismaCategory;
}

// ---------------------------------------------------------------------------
// A the status helpers
// ---------------------------------------------------------------------------

export function isTerminalStatus(s: string): boolean {
  return s === "SUCCEEDED" || s === "PARTIAL" || s === "FAILED" || s === "SKIPPED";
}

export type { ChangeSet };
