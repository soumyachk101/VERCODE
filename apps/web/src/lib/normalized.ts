// Normalized view-model types the pages render. Every field is optional or
// defaulted: a missing API field prints as a grey dash or a designed zero,
// never a crash or a fabricated value.

import type { Role, Severity } from "./types";

export interface AuthMe {
  id: string;
  name: string;
  email: string;
  orgs: { id: string; name: string; plan: string; role: string }[];
}

export interface NormalizedOrg {
  id: string;
  name: string;
  plan: string;
  status: string;
  renewalAt: string | null;
}

export interface NormalizedMembers {
  members: {
    id: string;
    name: string;
    email: string;
    role: Role | string;
    lastActiveAt: string | null;
  }[];
}

export interface NormalizedInstall {
  connected: boolean;
  account: string | null;
}

export interface NormalizedRepos {
  repos: {
    id: string;
    full_name: string;
    connected: boolean;
    url?: string;
  }[];
}

export interface NormalizedJob {
  id: string;
  repoId?: string;
  repoName?: string;
  prNumber: number;
  prTitle?: string;
  prUrl?: string;
  commitSha: string;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "skipped"
    | "partial";
  skipReason?: string;
  error?: string;
  createdAt: string;
  finishedAt?: string;
  costUsd?: number;
  findingsCount?: number;
  verdict?: string;
  summary?: {
    verdict?: string;
    highSeverityCount?: number;
    topRisks?: string[];
    overallConfidence?: number;
  } | null;
}

export interface NormalizedReviews {
  items: NormalizedJob[];
  total: number;
  nextCursor?: string | null;
}

export interface NormalizedFindings {
  items: {
    id: string;
    file: string;
    line: number;
    severity: Severity;
    category: string;
    title: string;
    description: string;
    suggestedFix?: string;
    confidence?: number;
    source?: string;
    diffContext?: string;
    repoName?: string;
    prNumber?: number;
    prUrl?: string;
    createdAt?: string;
    actioned: boolean;
    action?: string;
  }[];
  counts: Record<Severity, number>;
}

export interface NormalizedSecurity {
  open: Record<Severity, number>;
  actionedRate: { current: number; prior?: number; windowDays?: number } | null;
  items: NormalizedFindings["items"];
  total: number;
  series?: { date: string; high: number; critical: number }[];
}

export interface NormalizedUsage {
  series: {
    date: string;
    reviews: number;
    estUsd: number;
    inputTokens: number;
    outputTokens: number;
  }[];
  totals: { reviews: number; estUsd: number };
  quota: {
    used: number;
    limit: number;
    percentUsed: number;
    committed?: number;
  };
  perReviewUsd?: number;
  byProvider?: { provider: string; reviews: number; estUsd: number }[];
}

export interface NormalizedBilling {
  plan: string;
  status: string;
  renewalAt: string | null;
  invoices: { id: string; date: string; amountUsd: number; status: string }[];
  quota: { used: number; limit: number; percentUsed: number };
}

export interface NormalizedSettings {
  confidenceFloor?: number;
  maxFiles?: number;
  maxLines?: number;
  provider?: string;
  tokenSpendCapMonthlyUsd?: number;
  suppressedCategories?: string[];
}

export interface NormalizedProviders {
  provider?: string;
  byok: { active: boolean; last4?: string; provider?: string } | null;
  fallback?: string;
  routing: {
    task: string;
    provider: string;
    model: string;
    maxTokens?: number;
    tierGate?: string;
    available?: boolean;
  }[];
}

export interface NormalizedAudit {
  items: {
    id: string;
    timestamp: string;
    actor?: string;
    action: string;
    target?: string;
    sourceIp?: string;
  }[];
}
