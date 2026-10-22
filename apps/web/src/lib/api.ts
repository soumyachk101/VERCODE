// The dashboard API client (lib/): typed fetch to the api. The session cookie
// is same-origin (NEXT_PUBLIC_API_BASE, default http://localhost:4000) so no
// bearer handling — cookies ride the request (credentials: "include" so the
// cross-origin dev setup with api on :4000 still authenticates).
//
// Endpoints per docs/API/API_SPECIFICATION.md; response typing per the
// shared contract shapes (apps/web/src/lib/types.ts).

const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Json = Record<string, unknown> | null | undefined;

async function request<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> },
): Promise<T> {
  let url = `${API_BASE}/api/v1${path}`;
  if (init?.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let code = String(res.status);
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // the error body wasn't JSON — the status line is the message
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

const get = <T>(path: string, query?: Record<string, string | number | undefined>) =>
  request<T>(path, { method: "GET", query });
const post = <T>(path: string, body?: Json) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body?: Json) =>
  request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

export const api = { get, post, patch, del, API_BASE };
