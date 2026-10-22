import { z } from "zod";

// The GitHub webhook event schemas (WEBHOOK_SPECIFICATION.md §1.3 "the event
// body is validated against per-event Zod schemas"). A verified-but-malformed
// body (signature OK, schema fail) → 422 + not enqueued (ST-webhook-malformed).

// ---------------------------------------------------------------------------
// The envelope headers (the three verification layers, WEBHOOK_SPECIFICATION
// §1.1 — HMAC + timestamp + delivery dedup; a forged event fails layer 1, a
// captured event fails layer 2/3).
// ---------------------------------------------------------------------------
export const GitHubWebhookHeadersSchema = z.object({
  /** `X-Hub-Signature-256: sha256=<hmac>`, computed over the raw body (the KMS/env secret). */
  signature: z.string().startsWith("sha256="),
  /** `X-Hub-Delivery` — the replay-dedup key (the 24 h window, NFR-06). */
  deliveryId: z.string().min(1),
  /** `X-Hub-Timestamp` — the 5-min replay-protection window (layer 2). */
  timestamp: z.string().datetime(),
  /** `X-GitHub-Event` — the event type. */
  event: z
    .enum([
      "installation",
      "installation_repositories",
      "pull_request",
      "pull_request_review",
      "pull_request_target",
    ]),
});
export type GitHubWebhookHeaders = z.infer<typeof GitHubWebhookHeadersSchema>;

// ---------------------------------------------------------------------------
// The events (the MVP set, WEBHOOK_SPECIFICATION.md §1.2)
// ---------------------------------------------------------------------------

const InstallationActionSchema = z.enum(["created", "deleted"]);

export const InstallationEventSchema = z.object({
  action: InstallationActionSchema,
  installation: z.object({
    id: z.number().int(),
    account: z.object({
      type: z.string(),
      login: z.string(),
    }),
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

const PullRequestActionSchema = z.enum([
  "opened",
  "reopened",
  "synchronize",
  "closed",
  "edited",
  "labeled",
  "unlabeled",
]);

export const PullRequestEventSchema = z.object({
  action: PullRequestActionSchema,
  number: z.number().int().positive(),
  pull_request: z.object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string().nullable(),
    state: z.string(),
    head: z.object({
      sha: z.string().min(40),
      ref: z.string(),
    }),
    base: z.object({
      ref: z.string(),
    }),
  }),
  repository: z.object({
    id: z.number().int(),
    full_name: z.string(),
  }),
  installation: z.object({
    id: z.number().int(),
  }),
  sender: z.object({
    login: z.string(),
  }),
});
export type PullRequestEvent = z.infer<typeof PullRequestEventSchema>;

export const PullRequestReviewEventSchema = z.object({
  action: z.enum(["submitted", "edited", "dismissed"]),
  review: z.object({
    id: z.number().int(),
    state: z.string(),
  }),
  pull_request: z.object({
    number: z.number().int().positive(),
    head: z.object({ sha: z.string().min(40), ref: z.string() }),
  }),
  repository: z.object({ id: z.number().int(), full_name: z.string() }),
  installation: z.object({ id: z.number().int() }),
});
export type PullRequestReviewEvent = z.infer<typeof PullRequestReviewEventSchema>;

// `pull_request_target` (a fork PR — a review in a sandboxed context, publish
// to the base repo only, INTEGRATION_DESIGN.md §1.4 "the pull_request_target (forks)").
export const PullRequestTargetEventSchema = z.object({
  action: PullRequestActionSchema,
  number: z.number().int().positive(),
  pull_request: z.object({
    number: z.number().int().positive(),
    head: z.object({ sha: z.string().min(40), ref: z.string(), repo: z.object({ full_name: z.string() }) }),
    base: z.object({ ref: z.string() }),
  }),
  repository: z.object({ id: z.number().int(), full_name: z.string() }),
  installation: z.object({ id: z.number().int() }),
});
export type PullRequestTargetEvent = z.infer<typeof PullRequestTargetEventSchema>;

// ---------------------------------------------------------------------------
// The routing (a event → a schema, the "verified but malformed" check)
// ---------------------------------------------------------------------------
export const WEBHOOK_EVENT_SCHEMAS = {
  installation: InstallationEventSchema,
  installation_repositories: InstallationRepositoriesEventSchema,
  pull_request: PullRequestEventSchema,
  pull_request_review: PullRequestReviewEventSchema,
  pull_request_target: PullRequestTargetEventSchema,
} as const;

export type WebhookEventName = keyof typeof WEBHOOK_EVENT_SCHEMAS;
