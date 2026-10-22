import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api } from "./api";
import type {
  AuditResponse,
  BillingResponse,
  GitHubInstall,
  Invitation,
  JobDetail,
  ListReviewsResponse,
  Member,
  OrgDetail,
  OrgSettings,
  Profile,
  ProvidersResponse,
  ReposList,
  ReviewFinding,
  RulesResponse,
  SecurityRollup,
  Session,
  UsageResponse,
} from "./types";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        // Errors surface inside the block (an error state, not a thrown
        // promise the page unmounts on) — consumers render `isError`.
        throwOnError: false,
      },
    },
  });
}

// ---------------------------------------------------------------- the hooks
// Each returns a result the page renders: data | loading skeleton | the
// in-block error state ("Couldn't load X. Last updated …" + Retry).
// Every org-scoped hook takes `orgId?: string` + is `enabled: !!orgId`
// so a shell that hasn't resolved /org/me yet renders an empty block,
// not a 404 stack.

export function useAuthMe(): UseQueryResult<AuthMe> {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const r = await api.get<AuthMe>(`/auth/me`);
      return normalizeAuthMe(r);
    },
  });
}

// ---------------------------------------------------------------- org data
export function useOrg(orgId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none"],
    queryFn: () => api.get<OrgDetail>(`/orgs/${orgId}`),
    select: normalizeOrg,
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });
}
export function useMembers(orgId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "members"],
    queryFn: () => api.get<Member[]>(`/orgs/${orgId}/members`),
    select: normalizeMemberList,
    enabled: !!orgId,
  });
}
export function useInstall(orgId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "github"],
    queryFn: () => api.get<GitHubInstall>(`/orgs/${orgId}/github`),
    select: normalizeInstall,
    enabled: !!orgId,
  });
}
export function useRepos(orgId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "repos"],
    queryFn: () => api.get<ReposList>(`/orgs/${orgId}/github/repos`),
    select: normalizeRepos,
    enabled: !!orgId,
  });
}
export function useReviews(
  orgId: string | undefined,
  params: { status?: string; repoId?: string; prNumber?: number; since?: string } = {},
) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "reviews", params],
    queryFn: () =>
      api.get<ListReviewsResponse>(`/orgs/${orgId}/reviews`, {
        status: params.status,
        repoId: params.repoId,
        prNumber: params.prNumber,
        since: params.since,
      }),
    select: normalizeReviews,
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });
}
export function useJob(orgId?: string, jobId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "reviews", jobId ?? "none"],
    queryFn: () => api.get<JobDetail>(`/orgs/${orgId}/reviews/${jobId}`),
    select: normalizeJob,
    enabled: !!orgId && !!jobId,
  });
}
export function useFindings(orgId?: string, jobId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "findings", jobId ?? "none"],
    queryFn: () =>
      api.get<{ items: ReviewFinding[] }>(`/orgs/${orgId}/reviews/${jobId}/findings`),
    select: (r) => normalizeFindings(r?.items ?? []),
    enabled: !!orgId && !!jobId,
  });
}
export function useSecurity(orgId?: string, since?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "security", since],
    queryFn: () =>
      api.get<SecurityRollup & { items?: ReviewFinding[] }>(`/orgs/${orgId}/security`, {
        since,
      }),
    select: normalizeSecurity,
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });
}
export function useTrends(orgId: string | undefined, params: { repoId?: string } = {}) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "trends", params],
    queryFn: () =>
      api.get<import("./types").TrendsResponse>(`/orgs/${orgId}/trends`, {
        repoId: params.repoId,
        range: "30d",
      }),
    select: (r) => r?.series ?? [],
    enabled: !!orgId,
  });
}
export function useUsage(orgId: string | undefined, range: "30d" | "90d" | "12mo" = "30d") {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "usage", range],
    queryFn: () => api.get<UsageResponse>(`/orgs/${orgId}/usage`, { range }),
    select: normalizeUsage,
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });
}
export function useBilling(orgId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "billing"],
    queryFn: () => api.get<BillingResponse>(`/orgs/${orgId}/billing`),
    select: normalizeBilling,
    enabled: !!orgId,
  });
}
export function useSettings(orgId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "settings"],
    queryFn: () => api.get<OrgSettings>(`/orgs/${orgId}/settings`),
    select: normalizeSettings,
    enabled: !!orgId,
  });
}
export function useRules(orgId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "rules"],
    queryFn: () => api.get<RulesResponse>(`/orgs/${orgId}/rules`),
    select: (r) => r?.rules ?? [],
    enabled: !!orgId,
  });
}
export function useProviders(orgId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "providers"],
    queryFn: () => api.get<ProvidersResponse>(`/orgs/${orgId}/providers`),
    select: normalizeProviders,
    enabled: !!orgId,
  });
}
export function useAudit(orgId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "audit"],
    queryFn: () => api.get<AuditResponse>(`/orgs/${orgId}/audit`),
    select: normalizeAudit,
    enabled: !!orgId,
  });
}
export function useProfile() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Profile>(`/me`),
  });
}
export function useSessions() {
  return useQuery({
    queryKey: ["me", "sessions"],
    queryFn: () => api.get<Session[]>(`/me/sessions`),
  });
}

// ---------------------------------------------------------------- mutations
export function useFindingAction(orgId: string) {
  return useMutation({
    mutationFn: ({
      findingId,
      action,
    }: {
      findingId: string;
      action: string;
    }) =>
      api.post<{ findingId: string; action: string; actedAt: string }>(
        `/orgs/${orgId}/findings/${findingId}/actions`,
        { action },
      ),
  });
}
export function useReReview(orgId: string) {
  return useMutation({
    mutationFn: (payload: { prNumber: number; commitSha: string; repoId?: string }) =>
      api.post<{ jobId: string; status: string }>(`/orgs/${orgId}/github/review`, {
        prNumber: payload.prNumber,
        commitSha: payload.commitSha,
        repoId: payload.repoId,
      }),
  });
}
export function useSettingsUpdate(orgId: string) {
  return useMutation({
    mutationFn: (body: Partial<OrgSettings>) => api.patch(`/orgs/${orgId}/settings`, body),
  });
}
export function useByok(orgId: string) {
  return useMutation({
    mutationFn: (body: { provider: string; apiKey: string }) =>
      api.post<{ last4: string }>(`/orgs/${orgId}/providers/byok`, body),
  });
}
export function useByokRevoke(orgId: string) {
  return useMutation({
    mutationFn: () => api.del(`/orgs/${orgId}/providers/byok`),
  });
}
export function useSubscribe(orgId: string) {
  return useMutation({
    mutationFn: (body: { plan: string; atPeriodEnd?: boolean }) =>
      api.post(`/orgs/${orgId}/billing/subscribe`, body),
  });
}
export function useCancelSubscription(orgId: string) {
  return useMutation({
    mutationFn: () => api.post(`/orgs/${orgId}/billing/cancel`, { atPeriodEnd: true }),
  });
}
export function useInvite(orgId: string) {
  return useMutation({
    mutationFn: (body: { email: string; role: string }) =>
      api.post<Invitation>(`/orgs/${orgId}/invitations`, body),
  });
}
export function useChangeRole(orgId: string) {
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch(`/orgs/${orgId}/members/${userId}`, { role }),
  });
}
export function useRemoveMember(orgId: string) {
  return useMutation({
    mutationFn: (userId: string) => api.del(`/orgs/${orgId}/members/${userId}`),
  });
}
export function useSignOutAll() {
  return useMutation({
    mutationFn: () => api.post(`/auth/signout-all`),
  });
}

// ---------------------------------------------------------------- normalizers
// The API responses are the typed contracts; these adapt defensively (a
// missing field prints as a grey dash / a designed zero, never a crash).

import type {
  AuthMe,
  FindingSeverityCount,
  NormalizedBilling,
  NormalizedFindings,
  NormalizedJob,
  NormalizedMembers,
  NormalizedProviders,
  NormalizedRepos,
  NormalizedReviews,
  NormalizedSecurity,
  NormalizedSettings,
  NormalizedUsage,
  NormalizedAudit,
  NormalizedInstall,
  NormalizedOrg,
} from "./normalized";

export function normalizeAuthMe(r: unknown): AuthMe {
  const o = (r ?? {}) as Record<string, unknown>;
  return {
    id: String(o.id ?? ""),
    name: String(o.name ?? o.email ?? "You"),
    email: String(o.email ?? ""),
    orgs: Array.isArray(o.orgs)
      ? o.orgs.map((x) => {
          const m = x as Record<string, unknown>;
          return {
            id: String(m.id ?? ""),
            name: String(m.name ?? "org"),
            plan: (m.plan as string) ?? "free",
            role: (m.role as string) ?? "viewer",
          };
        })
      : [],
  };
}

export function normalizeOrg(r: unknown): NormalizedOrg {
  const o = (r ?? {}) as Record<string, unknown>;
  const b = (o.billing ?? {}) as Record<string, unknown>;
  return {
    id: String(o.id ?? ""),
    name: String(o.name ?? "org"),
    plan: (o.plan as string) ?? "free",
    status:
      (o.planStatus as string) ?? (b.status as string) ?? "active",
    renewalAt:
      o.renewalAt != null
        ? String(o.renewalAt)
        : b.renewalAt != null
          ? String(b.renewalAt)
          : b.nextInvoiceAt != null
            ? String(b.nextInvoiceAt)
            : null,
  };
}

export function normalizeMemberList(r: unknown): NormalizedMembers {
  const arr = Array.isArray(r) ? r : [];
  return {
    members: arr.map((x) => {
      const m = x as Record<string, unknown>;
      return {
        id: String(m.id ?? ""),
        name: String(m.name ?? m.email ?? "member"),
        email: String(m.email ?? ""),
        role: (m.role as string) ?? "viewer",
        lastActiveAt: m.lastActiveAt != null ? String(m.lastActiveAt) : null,
      };
    }),
  };
}

export function normalizeInstall(r: unknown): NormalizedInstall {
  const o = (r ?? {}) as Record<string, unknown>;
  if (o.connected !== undefined) {
    return {
      connected: !!o.connected,
      account: o.account != null ? String(o.account) : null,
    };
  }
  // some shapes: { install: {...} } or a bare install object
  const inst = (o.install ?? o) as Record<string, unknown>;
  return {
    connected: inst.id != null || inst.installedAt != null || (o.connected !== false),
    account: inst.account != null ? String(inst.account) : null,
  };
}

export function normalizeRepos(r: unknown): NormalizedRepos {
  const list = Array.isArray(r) ? r : ((r as Record<string, unknown> | null)?.items ?? []);
  const repos = (list as Array<Record<string, unknown>>).map((x) => ({
    id: String(x.id ?? x.full_name ?? ""),
    full_name: String(x.full_name ?? x.fullName ?? x.name ?? "repo"),
    connected: x.connected !== false && x.status !== "disconnected",
    url: x.url != null ? String(x.url) : undefined,
  }));
  return { repos };
}

export function normalizeReviews(r: unknown): NormalizedReviews {
  const o = (r ?? {}) as Record<string, unknown>;
  const arr = Array.isArray(o.items) ? o.items : Array.isArray(o) ? o : [];
  const items = (arr as Array<Record<string, unknown>>).map(normalizeJob);
  return {
    items,
    total: typeof o.total === "number" ? o.total : items.length,
    nextCursor: typeof o.next_cursor === "string" ? o.next_cursor : (o.nextCursor as string | undefined),
  };
}

export function normalizeJob(x: Record<string, unknown>): NormalizedJob {
  const summary = (x.summary ?? {}) as Record<string, unknown>;
  const sevCount = summary.highSeverityCount;
  return {
    id: String(x.id ?? ""),
    repoId: x.repoId != null ? String(x.repoId) : undefined,
    repoName: x.repoName != null ? String(x.repoName) : x.repo != null ? String((x.repo as Record<string, unknown>).full_name ?? (x.repo as string)) : undefined,
    prNumber: typeof x.prNumber === "number" ? x.prNumber : Number(x.pr_number ?? 0),
    prTitle: x.prTitle != null ? String(x.prTitle) : x.pr_title != null ? String(x.pr_title) : undefined,
    prUrl: x.prUrl != null ? String(x.prUrl) : x.pr_url != null ? String(x.pr_url) : undefined,
    commitSha: String(x.commitSha ?? x.commit_sha ?? ""),
    status: String(x.status ?? "queued") as NormalizedJob["status"],
    skipReason: x.skipReason != null ? String(x.skipReason) : x.skip_reason != null ? String(x.skip_reason) : undefined,
    error: x.error != null ? String(x.error) : undefined,
    createdAt: String(x.createdAt ?? x.created_at ?? ""),
    finishedAt: x.finishedAt != null ? String(x.finishedAt) : x.finished_at != null ? String(x.finished_at) : undefined,
    costUsd: typeof x.costUsd === "number" ? x.costUsd : typeof x.cost_usd === "number" ? x.cost_usd : undefined,
    findingsCount:
      typeof x.findingsCount === "number"
        ? x.findingsCount
        : typeof summary.highSeverityCount === "number"
          ? summary.highSeverityCount
          : undefined,
    verdict: summary.verdict != null ? String(summary.verdict) : undefined,
  };
}

export function normalizeFindings(r: unknown): NormalizedFindings {
  const arr = Array.isArray(r) ? r : [];
  const items = (arr as Array<Record<string, unknown>>).map((x) => ({
    id: String(x.id ?? ""),
    file: String(x.file ?? ""),
    line: Number(x.line ?? 0),
    severity: (String(x.severity ?? "low") as FindingSeverityCount["items"][number]["severity"]),
    category: String(x.category ?? "logic-bug"),
    title: String(x.title ?? "Untitled finding"),
    description: String(x.description ?? ""),
    suggestedFix: x.suggestedFix != null ? String(x.suggestedFix) : x.suggested_fix != null ? String(x.suggested_fix) : undefined,
    confidence: typeof x.confidence === "number" ? x.confidence : undefined,
    source: x.source != null ? String(x.source) : undefined,
    diffContext: x.diffContext != null ? String(x.diffContext) : x.diff_context != null ? String(x.diff_context) : undefined,
    repoName: x.repoName != null ? String(x.repoName) : undefined,
    prNumber: typeof x.prNumber === "number" ? x.prNumber : undefined,
    prUrl: x.prUrl != null ? String(x.prUrl) : x.pr_url != null ? String(x.pr_url) : undefined,
    createdAt: x.createdAt != null ? String(x.createdAt) : x.created_at != null ? String(x.created_at) : undefined,
    actioned: x.actioned === true || (x.action != null ? true : false),
    action: x.action != null ? String(x.action) : undefined,
  }));
  const counts: Record<NormalizedFindings["counts"][number], number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of items) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return { items, counts };
}

export function normalizeSecurity(r: unknown): NormalizedSecurity {
  const o = (r ?? {}) as Record<string, unknown>;
  const open = (o.open ?? o.counts ?? {}) as Record<string, number>;
  const itemsRaw = Array.isArray(o.items)
    ? o.items
    : Array.isArray(o.findings)
      ? o.findings
      : [];
  const items = (itemsRaw as Array<Record<string, unknown>>).map((x) => ({
    ...x,
    severity: x.severity,
  })) as NormalizedSecurity["items"];
  const actioned = (o.actionedRate ?? o.actioned_rate ?? null) as
    | { current: number; prior?: number; windowDays?: number }
    | null
    | string;
  const rate =
    typeof actioned === "object" && actioned != null
      ? {
          current: Number(actioned.current ?? 0),
          prior:
            typeof actioned.prior === "number" ? actioned.prior : undefined,
          windowDays:
            typeof actioned.windowDays === "number"
              ? actioned.windowDays
              : typeof actioned.window_days === "number"
                ? actioned.window_days
                : undefined,
        }
      : null;
  const series = Array.isArray(o.series)
    ? (o.series as Array<Record<string, unknown>>).map((p) => ({
        date: String(p.date ?? ""),
        high: Number(p.high ?? 0),
        critical: Number(p.critical ?? 0),
      }))
    : undefined;
  const zero = (n: unknown) => (typeof n === "number" ? n : 0);
  return {
    open: {
      critical: zero(open.critical),
      high: zero(open.high),
      medium: zero(open.medium ?? 0),
      low: zero(open.low ?? 0),
    },
    actionedRate: rate,
    items,
    total: typeof o.total === "number" ? o.total : items.length,
    series,
  };
}

export function normalizeUsage(r: unknown): NormalizedUsage {
  const o = (r ?? {}) as Record<string, unknown>;
  const seriesRaw = Array.isArray(o.series) ? o.series : [];
  const totals = (o.totals ?? {}) as Record<string, unknown>;
  const quotaRaw = (o.quota ?? {}) as Record<string, unknown>;
  const byProvider = Array.isArray(o.byProvider)
    ? (o.byProvider as Array<Record<string, unknown>>).map((p) => ({
        provider: String(p.provider ?? p.model ?? "provider"),
        reviews: Number(p.reviews ?? 0),
        estUsd: Number(p.estUsd ?? p.est_usd ?? 0),
      }))
    : undefined;
  const perReview =
    typeof totals.reviews === "number" && totals.reviews > 0
      ? Number(totals.estUsd ?? 0) / totals.reviews
      : undefined;
  return {
    series: (seriesRaw as Array<Record<string, unknown>>).map((d) => ({
      date: String(d.date ?? ""),
      reviews: Number(d.reviews ?? 0),
      estUsd: Number(d.estUsd ?? d.est_usd ?? 0),
      inputTokens: Number(d.inputTokens ?? d.input_tokens ?? 0),
      outputTokens: Number(d.outputTokens ?? d.output_tokens ?? 0),
    })),
    totals: {
      reviews: Number(totals.reviews ?? 0),
      estUsd: Number(totals.estUsd ?? totals.est_usd ?? 0),
    },
    quota: {
      used: Number(quotaRaw.used ?? 0),
      limit: Number(quotaRaw.limit ?? 0),
      percentUsed: Number(quotaRaw.percentUsed ?? quotaRaw.percent_used ?? 0),
      committed:
        quotaRaw.committed != null ? Number(quotaRaw.committed) : undefined,
    },
    perReviewUsd: perReview,
    byProvider,
  };
}

export function normalizeBilling(r: unknown): NormalizedBilling {
  const o = (r ?? {}) as Record<string, unknown>;
  const inv = Array.isArray(o.invoices) ? o.invoices : [];
  return {
    plan: String(o.plan ?? "free"),
    status: String(o.status ?? "active") as NormalizedBilling["status"],
    renewalAt: o.renewalAt != null ? String(o.renewalAt) : null,
    invoices: (inv as Array<Record<string, unknown>>).map((x) => ({
      id: String(x.id ?? ""),
      date: String(x.date ?? x.issued_at ?? ""),
      amountUsd: Number(x.amountUsd ?? x.amount_usd ?? 0),
      status: String(x.status ?? "paid"),
    })),
    quota: {
      used: Number(o.quota?.used ?? 0),
      limit: Number(o.quota?.limit ?? 0),
      percentUsed: Number(o.quota?.percentUsed ?? 0),
    },
  } as NormalizedBilling;
}

export function normalizeSettings(r: unknown): NormalizedSettings {
  const o = (r ?? {}) as Record<string, unknown>;
  return {
    confidenceFloor:
      typeof o.confidenceFloor === "number"
        ? o.confidenceFloor
        : typeof o.confidence_floor === "number"
          ? o.confidence_floor
          : undefined,
    maxFiles: typeof o.maxFiles === "number" ? o.maxFiles : undefined,
    maxLines: typeof o.maxLines === "number" ? o.maxLines : undefined,
    provider: o.provider != null ? String(o.provider) : undefined,
    tokenSpendCapMonthlyUsd:
      typeof o.tokenSpendCapMonthlyUsd === "number"
        ? o.tokenSpendCapMonthlyUsd
        : undefined,
    suppressedCategories: Array.isArray(o.suppressedCategories)
      ? (o.suppressedCategories as string[])
      : Array.isArray(o.suppressed_categories)
        ? (o.suppressed_categories as string[])
        : undefined,
  };
}

export function normalizeProviders(r: unknown): NormalizedProviders {
  const o = (r ?? {}) as Record<string, unknown>;
  const cfg = (o.config ?? o) as Record<string, unknown>;
  const byok = (cfg.byok ?? null) as Record<string, unknown> | null;
  const routing = Array.isArray(o.routing) ? o.routing : [];
  return {
    provider: cfg.provider != null ? String(cfg.provider) : undefined,
    byok: byok ? { active: !!byok.active, last4: byok.last4 != null ? String(byok.last4) : undefined, provider: byok.provider != null ? String(byok.provider) : undefined } : null,
    fallback: cfg.fallback != null ? String(cfg.fallback) : undefined,
    routing: (routing as Array<Record<string, unknown>>).map((x) => ({
      task: String(x.task ?? ""),
      provider: String(x.provider ?? ""),
      model: String(x.model ?? ""),
      maxTokens: typeof x.maxTokens === "number" ? x.maxTokens : undefined,
      tierGate: x.tierGate as string | undefined,
      available: x.available === false ? false : undefined,
    })),
  };
}

export function normalizeAudit(r: unknown): NormalizedAudit {
  const o = (r ?? {}) as Record<string, unknown>;
  const arr = Array.isArray(o.items) ? o.items : Array.isArray(o) ? o : [];
  return {
    items: (arr as Array<Record<string, unknown>>).map((x) => ({
      id: String(x.id ?? ""),
      timestamp: String(x.timestamp ?? x.createdAt ?? x.created_at ?? ""),
      actor: x.actor != null ? String(x.actor) : x.actorId != null ? String(x.actorId) : undefined,
      action: String(x.action ?? ""),
      target: x.target != null ? String(x.target) : x.targetType != null ? String(x.targetType) : undefined,
      sourceIp: x.sourceIp != null ? String(x.sourceIp) : x.source_ip != null ? String(x.source_ip) : undefined,
    })),
  };
}

// ---------------------------------------------------------------- misc exports
export type {
  AuthMe,
  NormalizedOrg,
  NormalizedMembers,
  NormalizedInstall,
  NormalizedRepos,
  NormalizedReviews,
  NormalizedJob,
  NormalizedFindings,
  NormalizedSecurity,
  NormalizedUsage,
  NormalizedBilling,
  NormalizedSettings,
  NormalizedProviders,
  NormalizedAudit,
};
