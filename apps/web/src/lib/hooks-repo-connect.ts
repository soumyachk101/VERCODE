"use client";

// Additive hooks for the dashboard repo-connect flow (P5's scope).
// Lives in its own file — hooks.ts is P6's, these never duplicate it.
//
// The connect flow reuses the existing GitHub App install (P6 owns
// github.ts): the install grants access to repos, the webhook ingress
// creates a `githubRepo` row per grant, and the POST /:id/github/connect
// endpoint re-enables a specific row. No new install model, no token
// plumbing — the candidate list is the UI's pick list, not a blind entry.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

// ---------------------------------------------------------------- types

/** A repo the connected user can add (the install's grantable-but-disconnected rows). */
export interface RepoCandidate {
  fullName: string;
  url: string;
  defaultBranch: string;
}

/** The GET /:id/github/candidates response. */
export interface RepoCandidatesResult {
  /** true when an ACTIVE install exists — false when the user must install first. */
  connected: boolean;
  candidates: RepoCandidate[];
  install?: {
    accountLogin: string;
    accountType: string;
    repositorySelection: string;
  };
}

// ---------------------------------------------------------------- queries

/**
 * The candidate repos for the org's ACTIVE install (the connect-another card's
 * pick list). Returns `{ connected: false, candidates: [] }` when no install
 * exists — the dashboard then shows the install-URL step instead.
 */
export function useRepoCandidates(orgId?: string) {
  return useQuery({
    queryKey: ["org", orgId ?? "none", "repo-candidates"],
    queryFn: async (): Promise<RepoCandidatesResult> => {
      const r = await api.get<Record<string, unknown>>(`/orgs/${orgId}/github/candidates`);
      return {
        connected: r?.connected === true,
        candidates: Array.isArray(r?.candidates)
          ? (r.candidates as unknown[]).map((c) => {
              const o = c as Record<string, unknown>;
              return {
                fullName: String(o.fullName ?? ""),
                url: String(o.url ?? `https://github.com/${o.fullName ?? ""}`),
                defaultBranch: String(o.defaultBranch ?? "main"),
              };
            })
          : [],
        install:
          r?.install != null
            ? {
                accountLogin: String(
                  (r.install as Record<string, unknown>).accountLogin ?? "",
                ),
                accountType: String(
                  (r.install as Record<string, unknown>).accountType ?? "",
                ),
                repositorySelection: String(
                  (r.install as Record<string, unknown>).repositorySelection ?? "all",
                ),
              }
            : undefined,
      };
    },
    enabled: !!orgId,
  });
}

// ---------------------------------------------------------------- mutations

/**
 * Connect a specific repo by fullName. On success, syncs the cached repos
 * list in place (appending the now-connected row) so the table reflects the
 * change immediately, and invalidates the candidates list (the just-
 * connected repo drops off). The existing `useRepos` cache (30s staleTime)
 * is patched rather than refetched — a refetch could land before this
 * mutation's row is committed, and would show the old empty state.
 */
export function useConnectRepo(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fullName: string): Promise<{ ok: boolean; fullName: string }> => {
      const r = await api.post<Record<string, unknown>>(`/orgs/${orgId}/github/connect`, {
        fullName,
      });
      return { ok: r?.ok === true, fullName: String(r?.fullName ?? fullName) };
    },
    onSuccess: ({ fullName }) => {
      // The table's data key (the one `useRepos` writes to): patch it in
      // place — the row exists (its `connected` is now true), so append it
      // if it isn't already in the cache. The `id` falls back to
      // `full_name` when the API response doesn't carry it (the table's
      // normalizer only needs a unique key for React; a refetch reconciles).
      const reposKey = ["org", orgId, "repos"];
      const cached = qc.getQueryData<unknown>(reposKey);
      const row = (cached as Record<string, unknown> | null)?.repos;
      if (Array.isArray(row) && !row.some((x) => (x as Record<string, unknown>).full_name === fullName)) {
        qc.setQueryData(reposKey, {
          ...((cached as Record<string, unknown>) ?? {}),
          repos: [
            ...row,
            {
              id: fullName,
              full_name: fullName,
              connected: true,
              url: `https://github.com/${fullName}`,
            },
          ],
        });
      }
      // The candidate list re-pulls (the just-connected repo drops off).
      qc.invalidateQueries({ queryKey: ["org", orgId, "repo-candidates"] });
    },
  });
}

/**
 * Open the GitHub App install URL (the no-install state's CTA). The URL is
 * static per github.ts (`/apps/vercode/installations/new`) — no token needed.
 * The mutation records the intent (audit) and returns the URL; the caller
 * navigates to it in a new tab.
 */
export function useInstallUrl(orgId: string) {
  return useMutation({
    mutationFn: async (): Promise<{ installUrl: string }> => {
      const r = await api.post<Record<string, unknown>>(
        `/orgs/${orgId}/github/install-url`,
      );
      return { installUrl: String(r?.installUrl ?? "https://github.com/apps/vercode/installations/new") };
    },
  });
}
