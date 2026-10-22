// The webhook verification (WEBHOOK_SPECIFICATION.md §1.1 "all three, in
// order; failure at any → reject"). The three layers are defense in depth
// (THREAT_MODEL.md T-01): a forged event fails layer 1 (HMAC), a captured
// event fails layer 2 (timestamp) or layer 3 (delivery dedup).
//
// This is pure + side-effect-free (a takes the headers + the raw body + the
// secret, returns a verdict) so it's trivially unit-testable (the mock
// webhook events in tests/fixtures are the input, the verdict is the
// output). The *receipt write + the enqueue* is the api route's job
// (SERVICE_BOUNDARIES "a webhook route only does verify + receipt + enqueue").

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export interface WebhookHeaders {
  /** `X-Hub-Signature-256: sha256=<hmac>` */
  signature: string;
  /** `X-Hub-Delivery` — the replay-dedup key. */
  deliveryId: string;
  /** `X-Hub-Timestamp` — the replay-protection window. */
  timestamp: string;
  /** `X-GitHub-Event` */
  event: string;
}

export interface WebhookVerifyResult {
  ok: boolean;
  /** The failure layer (a `signature` / a `timestamp` / a `replay` / a `schema`). */
  reason?: "signature" | "timestamp" | "replay" | "schema" | null;
  /** The event type (a only set when the signature + the timestamp pass). */
  event?: string;
}

/**
 * Verify a GitHub webhook. The *order* matters (a a bad signature is checked
 * before the timestamp — an attacker who captures a signed + in-window event
 * can't replay it past the window or the dedup; a bad signature can't be
 * "fixed" by a timestamp).
 *
 * @param rawBody the *raw* request body (a bytes, a stringified JSON) — the
 *   HMAC is computed over the raw body, not a re-serialized object (a
 *   re-serialization can change the byte order + fail the HMAC).
 */
export function verifyGitHubWebhook(
  headers: WebhookHeaders,
  rawBody: string | Uint8Array,
  secret: string,
  opts?: {
    now?: number;
    timestampWindowMs?: number;
    isDeliverySeen?: (deliveryId: string) => boolean;
  }
): WebhookVerifyResult {
  const now = opts?.now ?? Date.now();
  const timestampWindowMs = opts?.timestampWindowMs ?? 5 * 60 * 1000; // 5 min

  // Layer 1: the HMAC (a constant-time compare, a no-timing-attack).
  const bodyBuf = typeof rawBody === "string" ? new TextEncoder().encode(rawBody) : rawBody;
  const expected = "sha256=" + createHmac("sha256", secret).update(bodyBuf).digest("hex");
  const got = headers.signature;
  if (!safeEqual(got, expected)) {
    return { ok: false, reason: "signature" };
  }

  // Layer 2: the timestamp window (a a stale event is a replay, a not a
  // fresh delivery).
  const ts = Date.parse(headers.timestamp);
  if (Number.isNaN(ts)) {
    return { ok: false, reason: "timestamp" };
  }
  if (Math.abs(now - ts) > timestampWindowMs) {
    return { ok: false, reason: "timestamp" };
  }

  // Layer 3: the delivery dedup (a a seen delivery id is a replay, a 200
  // no-op downstream, a not a re-run).
  if (opts?.isDeliverySeen?.(headers.deliveryId)) {
    return { ok: false, reason: "replay" };
  }

  return { ok: true, reason: null, event: headers.event };
}

// A constant-time string compare (a a timing-attack defense, a no early-exit
// on the first mismatching byte).
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// ---------------------------------------------------------------------------
// The event-body schemas (a "a verified event is a *trigger*, not the source
// of truth" — a the body is shape-validated, a state is re-derived
// server-side, a WEBHOOK_SPECIFICATION.md §1.3 "a verified event whose body
// fails the event schema → 422").
// ---------------------------------------------------------------------------

export const InstallationEventSchema = z.object({
  action: z.enum(["created", "deleted"]),
  installation: z.object({
    id: z.number().int(),
    account: z.object({ type: z.string(), login: z.string() }),
    repositories: z.array(z.object({ id: z.number().int() })).optional(),
    permissions: z.record(z.string()).optional(),
  }),
});
export type InstallationEvent = z.infer<typeof InstallationEventSchema>;

export const InstallationRepositoriesEventSchema = z.object({
  action: z.enum(["added", "removed"]),
  installation: z.object({
    id: z.number().int(),
    account: z.object({ type: z.string(), login: z.string() }),
  }),
  repositories_added: z
    .array(z.object({ id: z.number().int(), full_name: z.string(), default_branch: z.string() }))
    .optional(),
  repositories_removed: z
    .array(z.object({ id: z.number().int(), full_name: z.string(), default_branch: z.string() }))
    .optional(),
});
export type InstallationRepositoriesEvent = z.infer<typeof InstallationRepositoriesEventSchema>;

export const PullRequestEventSchema = z.object({
  action: z.enum(["opened", "reopened", "synchronize", "closed", "edited"]),
  number: z.number().int().positive(),
  pull_request: z.object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string().nullable(),
    state: z.string(),
    head: z.object({ sha: z.string().min(40), ref: z.string() }),
    base: z.object({ ref: z.string() }),
  }),
  repository: z.object({ id: z.number().int(), full_name: z.string() }),
  installation: z.object({ id: z.number().int() }),
  sender: z.object({ login: z.string() }),
});
export type PullRequestEvent = z.infer<typeof PullRequestEventSchema>;

// The event → schema routing (a "a verified but malformed body → 422 +
// not enqueued", a WEBHOOK_SPECIFICATION.md §1.2 "event routing").
export const EVENT_SCHEMAS: Record<string, z.ZodTypeAny> = {
  installation: InstallationEventSchema,
  installation_repositories: InstallationRepositoriesEventSchema,
  pull_request: PullRequestEventSchema,
  pull_request_review: z.object({
    action: z.enum(["submitted", "edited", "dismissed"]),
    pull_request: z.object({
      number: z.number().int().positive(),
      head: z.object({ sha: z.string().min(40), ref: z.string() }),
    }),
    repository: z.object({ id: z.number().int(), full_name: z.string() }),
    installation: z.object({ id: z.number().int() }),
  }),
};

/**
 * Validate a *verified* event body against its schema. A schema failure is a
 * `WEBHOOK_MALFORMED` (a 422, a not enqueued, a audited). An unknown event
 * type is also a malformed (a we don't process it).
 */
export function validateEventBody(event: string, body: unknown): { ok: boolean; data?: unknown } {
  const schema = EVENT_SCHEMAS[event];
  if (!schema) return { ok: false };
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false };
  return { ok: true, data: parsed.data };
}

export * from "./diff.js";
export * from "./app-auth.js";
