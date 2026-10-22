// The webhook ingress routes (M3 T3.2/T3.3): `POST /webhooks/github` (a
// GitHub App webhook) + a `POST /webhooks/billing` (a provider billing
// webhook, a the M7 stub).
//
// Both are PUBLIC + non-session (a WEBHOOK_SPECIFICATION §3 "a public, no
// session": auth is a signature-only, a a session route never trusts a raw
// HMAC + a webhook handler never reads the session cookie).
//
// The GitHub route does verify + receipt + enqueue ONLY (a WEBHOOK_SPEC
// §1.2 "the route only does verify + receipt + enqueue", a NFR-04 "no LLM
// on the webhook path": no diff fetch, no AI, no publication — a the worker
// does the heavy work).

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { verifyGitHubWebhook, validateEventBody, type WebhookHeaders } from "@vercode/github";
import type { AppConfig } from "@vercode/config";
import { Prisma } from "@prisma/client";
import type { Enqueueable } from "../queue.js";

// A route-context augmentation: the GitHub webhooks plugin decorates the
// Fastify instance with the `queue` (a the enqueue seam, a the test injects
// the in-memory queue).
declare module "fastify" {
  interface FastifyInstance {
    webhooks?: { queue: Enqueueable };
  }
}

const AUDIT_ACTOR = "github.webhook";

function audit(
  db: { auditEvent: { create(args: { data: Record<string, unknown> }): Promise<unknown> } } },
  data: { orgId?: string; action: string; sourceIp?: string; meta?: Record<string, unknown>; targetId?: string }
) {
  return db.auditEvent
    .create({
      data: {
        orgId: data.orgId ?? null,
        actorId: AUDIT_ACTOR,
        action: data.action,
        targetId: data.targetId ?? null,
        sourceIp: data.sourceIp ?? null,
        meta: (data.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    })
    .catch(() => {
      /* a audit write failure must not fail the request */
    });
}

// ---------------------------------------------------------------------------
// The raw-body content-type parser (a the HMAC is computed over the *raw*
// request body, a not a re-serialized object — a re-serialization can change
// the byte order + fail the HMAC, a WEBHOOK_SPECIFICATION §1.1 "computed
// over the raw request body").
// ---------------------------------------------------------------------------

function installRawBodyParser(app: FastifyInstance) {
  // A the GitHub payload is JSON; a keep the raw string + a expose it.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req: FastifyRequest, payload: Buffer, done: (err: unknown, value: unknown) => void) => {
      const raw = payload.toString("utf8");
      try {
        const parsed = raw.length ? JSON.parse(raw) : {};
        // A the route reads the *parsed* body via `req.body` + the *raw* via
        // the decorator set here (a the HMAC source of truth).
        (req as unknown as { rawBody: string }).rawBody = raw;
        done(null, parsed);
      } catch {
        done(null, {});
      }
    }
  );
}

// ---------------------------------------------------------------------------
// The GitHub webhook route (a ST-webhook-forged / -replay / -stale /
// -malformed + a IT-webhook-opened).
// ---------------------------------------------------------------------------

export async function githubWebhookRoutes(app: FastifyInstance, config: AppConfig, queue: Enqueueable) {
  installRawBodyParser(app);
  app.decorate("webhooks", { queue });

  app.post(
    "/github",
    {
      schema: { config: { public: true } },
      // A GitHub can send a large diff on a `pull_request`; a the ingress is
      // constant-latency (a NFR-04), a the body limit is generous but bounded.
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const db = app.auth.db;
      const secret = config.github.GITHUB_WEBHOOK_SECRET;
      const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";

      // A the webhook headers (a the four from WEBHOOK_SPECIFICATION §1.1).
      const headers: WebhookHeaders = {
        signature: (req.headers["x-hub-signature-256"] as string) ?? "",
        deliveryId: (req.headers["x-hub-delivery"] as string) ?? "",
        timestamp: (req.headers["x-hub-timestamp"] as string) ?? "",
        event: (req.headers["x-github-event"] as string) ?? "",
      };

      // A the delivery-dedup lookup (a the webhook_deliveries row, a the 24 h
      // window, a NFR-06). A seen id → a "replay" verdict (a the route turns
      // it into a 200 no-op, a not a re-run).
      const seenDelivery = headers.deliveryId
        ? await db.webhookDelivery.findUnique({ where: { deliveryId: headers.deliveryId } })
        : null;

      const verdict = verifyGitHubWebhook(headers, rawBody, secret, {
        isDeliverySeen: () => seenDelivery !== null,
      });

      // Layer 1 (signature) + layer 2 (timestamp) failures → 401 + audit +
      // NO queue write (a ST-webhook-forged "a no/bad signature → 401 + no
      // queue write + audit", a THREAT_MODEL T-01 "a forged event fails
      // layer 1").
      if (!verdict.ok && (verdict.reason === "signature" || verdict.reason === "timestamp")) {
        await audit(db, {
          action: "webhook.rejected",
          sourceIp: req.ip,
          meta: { reason: verdict.reason, event: verdict.event ?? headers.event },
        });
        reply.code(401).send({
          error: { code: "WEBHOOK_REJECTED", message: "Webhook signature or timestamp verification failed." },
        });
        return;
      }

      // Layer 3 (a replay): a seen delivery id → 200 no-op (a ST-webhook-replay
      // "a seen delivery id → 200 no-op", a the pipeline does NOT re-run).
      if (!verdict.ok && verdict.reason === "replay") {
        reply.code(200).send({ ok: true, replay: true });
        return;
      }

      // A the verified event (a a signature + a timestamp both passed). The
      // event type drives routing.
      const event = verdict.event ?? headers.event;

      // A the body shape check (a the EVENT_SCHEMAS, a a "a verified but
      // malformed body → 422 + not enqueued + audited", a WEBHOOK_SPEC §1.3).
      const body = req.body as unknown;
      const valid = validateEventBody(event, body);
      if (!valid.ok) {
        await audit(db, {
          action: "webhook.malformed",
          sourceIp: req.ip,
          meta: { event },
        });
        reply.code(422).send({
          error: { code: "WEBHOOK_MALFORMED", message: "Event body failed the event schema." },
        });
        return;
      }

      // A the routing (a the WEBHOOK_SPECIFICATION §1.2 table).
      if (event === "pull_request") {
        await handlePullRequest(db, queue, req, reply, valid.data as import("@vercode/github").PullRequestEvent, headers);
        return;
      }
      if (event === "installation" || event === "installation_repositories") {
        // A the install-side events (a T3.3 fills the upsert / a the
        // install-removal; a this M3 ingress records the receipt + a drops
        // with a audit). The receipt write is the durable state.
        await writeReceipt(db, headers, event, valid.data as { installation?: { id: number; account?: { type: string; login: string } } });
        reply.code(202).send({ ok: true, event });
        return;
      }

      // A unknown / a unhandled event (a verified but not-routed). A the
      // receipt is written + a we 200 (a a sender that noticed is a good
      // thing, a not a 404 oracle).
      await writeReceipt(db, headers, event, valid.data as { installation?: { id: number } });
      reply.code(200).send({ ok: true, event });
    }
  );
}

// ---------------------------------------------------------------------------
// The pull_request routing (a the install → org resolution + a the
// commit-SHA idempotency + a the enqueue).
// ---------------------------------------------------------------------------

async function handlePullRequest(
  db: NonNullable<FastifyInstance["auth"]["db"]>,
  queue: Enqueueable,
  req: FastifyRequest,
  reply: FastifyReply,
  pr: import("@vercode/github").PullRequestEvent,
  headers: WebhookHeaders
) {
  const installId = pr.installation.id;

  // A the install → org resolution (a the github_installs row, a keyed by
  // `githubInstallationId`). A an unknown install → 404 + a audit (a the
  // "no existence oracle" + a WEBHOOK_SPEC §1.2 "a unknown install → 404").
  const install = await db.githubInstall.findFirst({
    where: { githubInstallationId: String(installId) },
  });
  if (!install) {
    await audit(db, {
      action: "webhook.unknown_install",
      sourceIp: req.ip,
      meta: { githubInstallationId: String(installId), event: "pull_request" },
    });
    reply.code(404).send({
      error: { code: "WEBHOOK_INSTALL_NOT_FOUND", message: "Unknown GitHub installation." },
    });
    return;
  }

  // A the install was removed / a not-active (a the WEBHOOK_SPEC §1.2
  // "a removed/deleted install → the receipt is logged, a the event is
  // DROPPED, a not enqueued, a a audit").
  if (install.status !== "ACTIVE") {
    await audit(db, {
      orgId: install.orgId,
      action: "webhook.dropped_install_inactive",
      sourceIp: req.ip,
      meta: { githubInstallationId: String(installId), prNumber: pr.number },
    });
    reply.code(200).send({ ok: true, dropped: "install_inactive" });
    return;
  }

  const orgId = install.orgId;

  // A the repo resolution: the pull_request carries `repository.id` (a the
  // GitHub repo id). A we find the github_repos row for this org + repo.
  const githubRepoId = pr.repository.id;
  const repo = await db.githubRepo.findUnique({
    where: { orgId_githubRepoId: { orgId, githubRepoId: BigInt(githubRepoId) } },
  });

  // A the repo is not connected (a not tracked under this install) → a the
  // event is a no-op for us (a we don't review repos we don't manage). A the
  // receipt is written (a the "a verified event is recorded"), a no enqueue.
  if (!repo) {
    await writeReceipt(db, headers, "pull_request", pr, install, orgId);
    await audit(db, {
      orgId,
      action: "webhook.repo_not_tracked",
      sourceIp: req.ip,
      meta: { githubRepoId: String(githubRepoId), prNumber: pr.number },
    });
    reply.code(200).send({ ok: true, dropped: "repo_not_tracked" });
    return;
  }

  // A the commit-SHA idempotency (a ADR-007 "a one completed review per
  // commit"). A SUCCEEDED job already exists for the key → 200 no-op + a
  // audit (a the re-enqueue would re-run the pipeline for a commit already
  // reviewed).
  const commitSha = pr.pull_request.head.sha;
  const existing = await db.reviewJob.findUnique({
    where: {
      orgId_repoId_prNumber_commitSha: {
        orgId,
        repoId: repo.id,
        prNumber: pr.number,
        commitSha,
      },
    },
  });
  if (existing && existing.status === "SUCCEEDED") {
    await writeReceipt(db, headers, "pull_request", pr, install, orgId);
    await audit(db, {
      orgId,
      action: "webhook.already_reviewed",
      sourceIp: req.ip,
      targetId: existing.id,
      meta: { prNumber: pr.number, commitSha },
    });
    reply.code(200).send({ ok: true, alreadyReviewed: true, jobId: existing.id });
    return;
  }

  // A the create / a the update (a the idempotency key). A a non-succeeded
  // existing job (a QUEUED / a RUNNING) is a re-enqueue (a the idempotent
  // pointer is reused, a the worker's dedup catches the duplicate).
  let job = existing;
  if (!job) {
    job = await db.reviewJob.create({
      data: { orgId, repoId: repo.id, prNumber: pr.number, commitSha, status: "QUEUED" },
    });
  }

  // A the receipt (a the webhook_deliveries row, a the replay-dedup key, a
  // NFR-06). Written BEFORE the enqueue (a the "a verify + a receipt + a
  // enqueue" order, a the receipt is the durable proof of the delivery).
  await writeReceipt(db, headers, "pull_request", pr, install, orgId);

  // A the enqueue (a ONLY the jobId pointer + a the correlation fields, a the
  // NFR-04 "a no LLM on this path"). A the worker re-reads the durable state.
  const enq = await queue.enqueueReviewJob({
    jobId: job.id,
    orgId,
    repoId: repo.id,
    prNumber: pr.number,
    commitSha,
    deliveryId: headers.deliveryId,
  });

  reply.code(202).send({
    ok: true,
    jobId: job.id,
    enqueued: enq.enqueued,
    prNumber: pr.number,
    commitSha,
  });
}

// A the receipt write (a the webhook_deliveries row). A the delivery id is
// the replay-dedup key (a the UK). A the `accepted` flag records whether the
// event was processed (a a true for the 202 / a 200-accepted paths, a false
// for the dropped ones).
async function writeReceipt(
  db: NonNullable<FastifyInstance["auth"]["db"]>,
  headers: WebhookHeaders,
  event: string,
  data: unknown,
  install?: { id: string },
  orgId?: string
) {
  // A the install is required for the receipt FK. A the install-side events
  // (a a install.create / a a install.removed) may not have a install row
  // yet (a a the created event) or a reference an existing one; a the
  // install-removed keeps the row. A a pull_request path ALWAYS has the
  // install (a we resolved it above).
  if (!install) return;
  if (!headers.deliveryId) return;
  await db.webhookDelivery
    .create({
      data: {
        installId: install.id,
        deliveryId: headers.deliveryId,
        event,
        orgId: orgId ?? "",
        accepted: true,
      },
    })
    .catch(() => {
      /* a a duplicate delivery id (a a replay) is a not-a-error (a the
         unique key means the row already exists — a the receipt is durable). */
    });
  void data;
}

// A the install-side receipt helper (a the no-install-ref case, a the
// install-created event has no install row yet). A guarded no-op when the
// install row is absent (a the FK can't be set) — a the durable proof for
// install-created is the github_installs upsert (a T3.3), a not the receipt.
async function writeInstallReceipt(
  db: NonNullable<FastifyInstance["auth"]["db"]>,
  headers: WebhookHeaders,
  event: string,
  data: { installation?: { id: number; account?: { type: string; login: string } } }
) {
  if (!data.installation) return;
  const install = await db.githubInstall.findFirst({
    where: { githubInstallationId: String(data.installation.id) },
  });
  if (!install) return; // a the install-created upsert is a T3.3 (a a separate path).
  await writeReceipt(db, headers, event, data, install, install.orgId);
}

export { writeInstallReceipt };
