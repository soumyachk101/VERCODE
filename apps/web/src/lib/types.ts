// Typed response shapes for the dashboard REST API (docs/API/API_SPECIFICATION.md,
// packages/contracts). Shapes the routes don't yet return are marked optional /
// defaulted at the edge (the UI renders an honest zero or dash, never a guess).

export type Plan = "free" | "developer" | "team" | "enterprise";

export type Severity = "critical" | "high" | "medium" | "low";

export type FindingCategory =
  | "logic-bug"
  | "security"
  | "performance"
  | "race-condition"
  | "resource-leak"
  | "api-contract"
  | "db-consistency"
  | "edge-case"
  | "assumption";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "skipped" | "partial";

export type Role = "owner" | "admin" | "developer" | "viewer";

// ------------------------------------------------------------------ auth/me
export interface OrgSummary {
  id: string;
  name: string;
  plan: Plan;
  role: Role;
}
export interface AuthMe {
  id: string;
  name: string;
  email: string;
  orgs: OrgSummary[];
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  /** the per-user GitHub OAuth (the account page's "GitHub" block). */
  githubConnected?: boolean;
  githubHandle?: string | null;
}

export interface GitHubConnection {
  connected: boolean;
  handle: string | null;
}

export interface Session {
  id: string;
  device?: string;
  ip?: string;
  lastActiveAt: string;
  current?: boolean;
}

// ---------------------------------------------------------------- org
export interface OrgDetail {
  id: string;
  name: string;
  plan: Plan;
  planStatus?: "active" | "past_due" | "canceled" | "upgrading";
  billing?: {
    renewalAt?: string | null;
    status?: string;
  };
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastActiveAt?: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt?: string;
}

// ---------------------------------------------------------------- github
export interface GitHubInstall {
  connected: boolean;
  installId?: string;
  account?: string;
  connectedAt?: string;
}

export interface Repo {
  id: string;
  full_name: string;
  name?: string;
  url?: string;
  connected: boolean;
}

// ---------------------------------------------------------------- reviews
export interface ReviewSummary {
  verdict: string;
  highSeverityCount: number;
  topRisks: string[];
  overallConfidence: number;
}

export interface ReviewFinding {
  id: string;
  file: string;
  line: number;
  severity: Severity;
  category: FindingCategory;
  title: string;
  description: string;
  suggestedFix?: string;
  confidence: number;
  source?: string; // "eslint" | "semgrep" | "ai-deep" | "ai-security" | "deterministic-summary"
  // optional enrichment the engine records:
  diffContext?: string;
  // repo/pr for the rollup view (denormalised by the API when scoped)
  repoId?: string;
  repoName?: string;
  prNumber?: number;
  prTitle?: string;
  prUrl?: string;
  githubUrl?: string;
  jobId?: string;
  commitSha?: string;
  createdAt?: string;
  actioned?: boolean;
  action?: string | null;
}

export interface ReviewJob {
  id: string;
  repoId?: string;
  repoName?: string;
  prNumber: number;
  prTitle?: string;
  prUrl?: string;
  commitSha: string;
  status: JobStatus;
  skipReason?:
    | "quota_exceeded"
    | "same_sha"
    | "install_removed"
    | "pr_closed"
    | "over_budget_degraded";
  error?: string;
  createdAt: string;
  finishedAt?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  findingsCount?: number;
  summary?: ReviewSummary | null;
}

export interface ListReviewsResponse {
  items: ReviewJob[];
  nextCursor?: string | null;
  total?: number;
}

export interface JobDetail extends ReviewJob {
  summary?: ReviewSummary | null;
  degradedStages?: string[];
}

// ---------------------------------------------------------------- security
export interface SecurityRollup {
  open: Record<Severity, number>;
  actionedRate?: {
    current: number;
    prior?: number;
    windowDays?: number;
  } | null;
  series?: SecurityTrendPoint[];
}

export interface SecurityTrendPoint {
  date: string;
  high: number;
  critical: number;
}

export type SecurityFinding = ReviewFinding;

export interface ListSecurityResponse {
  items: SecurityFinding[];
  nextCursor?: string | null;
  total?: number;
}

// ---------------------------------------------------------------- trends
export interface TrendPoint {
  date: string;
  category: FindingCategory;
  count: number;
}
export interface TrendsResponse {
  series: TrendPoint[];
}

// ---------------------------------------------------------------- settings/rules
export interface OrgSettings {
  confidenceFloor?: number;
  maxFiles?: number;
  maxLines?: number;
  provider?: string;
  tokenSpendCapMonthlyUsd?: number;
  suppressedCategories?: FindingCategory[];
}

export interface RuleOverride {
  id?: string;
  repoId: string;
  repoName?: string;
  overrides: string[];
  version?: number;
}
export interface RulesResponse {
  rules: RuleOverride[];
}

// ---------------------------------------------------------------- providers
export interface ProviderConfig {
  provider?: string;
  byok?: {
    active: boolean;
    last4?: string;
    provider?: string;
  } | null;
  fallback?: string;
}
export interface RoutingRow {
  task: string;
  provider: string;
  model: string;
  maxTokens?: number;
  tierGate?: "standard" | "standard+strong" | "any";
  available?: boolean;
}
export interface ProvidersResponse {
  config: ProviderConfig;
  routing: RoutingRow[];
}

// ---------------------------------------------------------------- usage
export interface UsageDaily {
  date: string;
  reviews: number;
  inputTokens: number;
  outputTokens: number;
  estUsd: number;
}
export interface Quota {
  used: number;
  limit: number;
  percentUsed: number;
  /** reviews already committed (queued jobs) past the spent mark */
  committed?: number;
}
export interface UsageByProvider {
  provider: string;
  model?: string;
  reviews: number;
  estUsd: number;
}
export interface UsageResponse {
  series: UsageDaily[];
  totals: {
    reviews: number;
    inputTokens: number;
    outputTokens: number;
    estUsd: number;
    bySeverity?: Record<string, number>;
  };
  quota: Quota;
  byProvider?: UsageByProvider[];
}

// ---------------------------------------------------------------- billing
export interface Invoice {
  id: string;
  date: string;
  amountUsd: number;
  status: string;
}
export interface BillingResponse {
  plan: Plan;
  status: "active" | "past_due" | "canceled" | "upgrading";
  renewalAt?: string | null;
  invoices: Invoice[];
  quota: Quota;
}

// ---------------------------------------------------------------- audit
export interface AuditEntry {
  id: string;
  timestamp: string;
  actor?: string;
  actorId?: string;
  action: string;
  target?: string;
  sourceIp?: string;
}
export interface AuditResponse {
  items: AuditEntry[];
  nextCursor?: string | null;
}

export const SKIP_REASON_LABEL: Record<string, string> = {
  quota_exceeded: "Quota reached",
  same_sha: "Already reviewed at this commit",
  install_removed: "GitHub App disconnected",
  pr_closed: "PR closed",
  over_budget_degraded: "Over monthly budget — AI stage degraded",
};

export function jobStatusLabel(status: JobStatus, skipReason?: string | null): string {
  switch (status) {
    case "succeeded":
      return "Published";
    case "partial":
      return "Partial — AI stage degraded, static findings published";
    case "skipped":
      return `Skipped — ${SKIP_REASON_LABEL[skipReason ?? ""] ?? "reason unknown"}`;
    case "failed":
      return "Failed — review did not complete";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
  }
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

/** Deterministic per-person hue tint for avatars (two people ≥60° apart). */
export function personHue(nameOrId: string): number {
  let h = 0;
  for (let i = 0; i < nameOrId.length; i++) h = (h * 31 + nameOrId.charCodeAt(i)) % 360;
  return h;
}
