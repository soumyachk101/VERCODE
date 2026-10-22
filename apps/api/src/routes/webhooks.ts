// The GitHub webhook ingress route (M3 T3.2): `POST /webhooks/github`.
//
// PUBLIC + non-session (a WEBHOOK_SPECIFICATION §3 "a public, no session":
// auth is a signature-only; a webhook handler never reads the session
// cookie). The route does verify + receipt + enqueue ONLY (a WEBHOOK_SPEC
// §1.2 "the route only does verify + receipt + enqueue", a NFR-04 "no LLM on
// the webhook path" — a no diff fetch, a no AI, a no publication).
//
// The ingress-time rules (a WEBHOOK_SPECIFICATION §1.2 "Ingress-time
// rules"):
//   - signature / a timestamp failure → 401 `WEBHOOK_REJECTED` + a audit,
//     NO queue write (a ST-webhook-forged, a THREAT_MODEL T-01 "a forged
//     event fails layer 1").
//   - a seen delivery id → 200 no-op (a ST-webhook-replay, a NFR-06 the
//     delivery-dedup table).
//   - a verified-but-malformed body → 422 `WEBHOOK_MALFORMED` + a audit, a
//     not enqueued (a WEBHOOK_SPEC §1.3).
//   - a unknown install (a the `github_installs` row absent) → 404 + a
//     audit (a "no existence oracle", a WEBHOOK_SPEC §1.2 "a unknown install
//     → 404 + a audit").
//   - a removed/inactive install → the receipt is logged, a the event is
//     DROPPED (a not enqueued), a audit `webhook.dropped_install_inactive`.
//   - a SUCCEEDED job already exists for the commit-SHA idempotency key →
//     200 no-op + a audit (a ADR-007 "a one completed review per commit").
//
// The HMAC is computed over the *raw* request body (a not a re-serialized
// object — a re-serialization can change the byte order + a fail the HMAC,
// a WEBHOOK_SPEC §1.1 "computed over the raw request body"). A custom
// content-type parser keeps the raw string.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@vercode/config";
import {
  verifyGitHubWebhook,
  validateEventBody,
  type WebhookHeaders,
  type PullRequestEvent,
} from "@vercode/github";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Enqueueable } from "../queue.js";

// A the Fastify-instance decoration (a the enqueue seam; a the test injects
// the in-memory queue, a the api injects a BullQueue).
declare module "fastify" {
  interface FastifyInstance {
    webhooks?: { queue: Enqueueable };
  }
}

// A the audit writer (a the append-only `audit_events`, a the "a every
// rejection is audited" invariant, a WEBHOOK_SPEC §3 "a every rejection is
// audited: 401/422/404 on either ingress writes an audit_events row").
// A a audit write failure never fails the request (a a rejection is still a
// rejected; a the audit is a observability, a not a gate).
function audit(
  db: PrismaClient,
  data: {
    orgId?: string | null;
    action: string;
    sourceIp?: string;
    targetId?: string | null;
    meta?: Record<string, unknown>;
  }
) {
  return db.auditEvent
    .create({
      data: {
        orgId: data.orgId ?? null,
        actorId: "github.webhook",
        action: data.action,
        targetId: data.targetId ?? null,
        sourceIp: data.sourceIp ?? null,
        meta: (data.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    })
    .catch(() => {
      /* a a audit-write failure is a not a request failure. */
    });
}

// A the raw-body parser (a the HMAC source of truth). A the parser returns
// the *parsed* JSON to the route (a `req.body`) + a stashes the raw string
// on the request (a `req.rawBody`), a so the route has both.
function installRawBodyParser(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req: FastifyRequest, payload: Buffer, done: (err: unknown, value: unknown) => void) => {
      const raw = payload.toString("utf8");
      const stashed = _req as unknown as { rawBody?: string };
      stashed.rawBody = raw;
      try {
        const parsed = raw.length ? JSON.parse(raw) : {};
        done(null, parsed);
      } catch {
        // A a non-JSON body: a the route's signature check will likely fail
        // (a a GitHub webhook is JSON). A we still hand back a {} so a the
        // route logic doesn't crash on a undefined body.
        done(null, {});
      }
    }
  );
}

// A the receipt write (a the `webhook_deliveries` row, a the replay-dedup
// key, a NFR-06 "a the delivery dedup table, a 24 h window"). A the
// `accepted` flag records whether the event was accepted (a true for the
// 202 / a 200-accepted paths; a false for the dropped ones). A a duplicate
// delivery id (a a replay) → the unique key rejects; a we swallow that
// (a the receipt is already durable, a a not an error).
async function writeReceipt(
  db: PrismaClient,
  opts: {
    installId: string;
    deliveryId: string;
    event: string;
    orgId: string;
    accepted?: boolean;
  }
) {
  if (!opts.deliveryId) return;
  await db.webhookDelivery
    .create({
      data: {
        installId: opts.installId,
        deliveryId: opts.deliveryId,
        event: opts.event,
        orgId: opts.orgId,
        accepted: opts.accepted ?? true,
      },
    })
    .catch(() => {
      /* a a duplicate delivery id (a a replay) — a the row already exists;
         a the receipt is durable, a not an error. */
    });
}

// ---------------------------------------------------------------------------
// The route (a `POST /github`, a the prefix is `/webhooks`).
// ---------------------------------------------------------------------------

export async function githubWebhookRoutes(app: FastifyInstance, config: AppConfig, queue: Enqueueable) {
  installRawBodyParser(app);
  app.decorate("webhooks", { queue });

  app.post(
    "/github",
    { schema: { config: { public: true } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const db = app.auth.db;
      const secret = config.github.GITHUB_WEBHOOK_SECRET;
      const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";

      // A the four webhook headers (a WEBHOOK_SPECIFICATION §1.1).
      const headers: WebhookHeaders = {
        signature: (req.headers["x-hub-signature-256"] as string) ?? "",
        deliveryId: (req.headers["x-hub-delivery"] as string) ?? "",
        timestamp: (req.headers["x-hub-timestamp"] as string) ?? "",
        event: (req.headers["x-github-event"] as string) ?? "",
      };

      // A the delivery-dedup lookup (a the `webhook_deliveries` row, a the
      // 24 h window). A a seen id → the "replay" verdict (a the route turns
      // it into a 200 no-op, a not a re-run).
      const deliverySeen = headers.deliveryId
        ? (await db.webhookDelivery.findUnique({ where: { deliveryId: headers.deliveryId } })) !== null
        : false;

      const verdict = verifyGitHubWebhook(headers, rawBody, secret, {
        isDeliverySeen: () => deliverySeen,
      });

      // Layer 1 (a signature) + a layer 2 (a timestamp) failures → 401 + a
      // audit + NO queue write (a ST-webhook-forged, a THREAT_MODEL T-01).
      if (verdict.reason === "signature" || verdict.reason === "timestamp") {
        await audit(db, {
          action: "webhook.rejected",
          sourceIp: req.ip,
          meta: { reason: verdict.reason ?? "signature", event: headers.event },
        });
        reply.code(401).send({
          error: { code: "WEBHOOK_REJECTED", message: "Signature or timestamp verification failed." },
        });
        return;
      }

      // Layer 3 (a replay): a seen delivery id → 200 no-op (a ST-webhook-
      // replay, a the pipeline does not re-run).
      if (verdict.reason === "replay") {
        reply.code(200).send({ ok: true, replay: true });
        return;
      }

      // A the verified event (a a signature + a timestamp both passed). A
      // the event type drives the routing (a WEBHOOK_SPEC §1.2).
      const event = verdict.event ?? headers.event;

      // A the body shape check (a the EVENT_SCHEMAS, a a "a verified but
      // malformed body → 422 + a not enqueued + a audited", a WEBHOOK_SPEC
      // §1.3 "a signature proves origin; a schema proves shape").
      const valid = validateEventBody(event, req.body);
      if (!valid.ok) {
        await audit(db, { action: "webhook.malformed", sourceIp: req.ip, meta: { event } });
        reply.code(422).send({
          error: { code: "WEBHOOK_MALFORMED", message: "Event body failed the event schema." },
        });
        return;
      }

      if (event === "pull_request") {
        await routePullRequest(db, queue, req, reply, valid.data as PullRequestEvent, headers);
        return;
      }

      // A the install-side events (a the `installation` / a
      // `installation_repositories` — a the M3 T3.3 install flow + a the
      // repo discovery; a this ingress path records the receipt + a drops
      // with a audit, a no enqueue).
      if (event === "installation" || event === "installation_repositories") {
        const installData = valid.data as {
          installation?: { id: number; account?: { type: string; login: string } };
        };
        await routeInstallEvent(db, req, reply, event, installData, headers);
        return;
      }

      // A unknown / a unhandled event (a verified but not-routed). A we 200
      // (a a sender that noticed is a good thing, a not a 404 oracle).
      reply.code(200).send({ ok: true, event, unrouted: true });
    }
  );
}

// A the `pull_request` routing: a the install→org resolution + a the
// commit-SHA idempotency + a the enqueue.
async function routePullRequest(
  db: PrismaClient,
  queue: Enqueueable,
  req: FastifyRequest,
  reply: FastifyReply,
  pr: PullRequestEvent,
  headers: WebhookHeaders
) {
  const installGhId = String(pr.installation.id);

  // A the install → org resolution (a the `github_installs` row, a keyed by
  // `githubInstallationId`). A a unknown install → 404 + a audit (a the "no
  // existence oracle", a WEBHOOK_SPEC §1.2 "a unknown install → 404 + a
  // audit").
  const install = await db.githubInstall.findFirst({ where: { githubInstallationId: installGhId } });
  if (!install) {
    await audit(db, {
      action: "webhook.unknown_install",
      sourceIp: req.ip,
      meta: { githubInstallationId: installGhId, prNumber: pr.number },
    });
    reply.code(404).send({
      error: { code: "WEBHOOK_INSTALL_NOT_FOUND", message: "Unknown GitHub installation." },
    });
    return;
  }

  // A the removed / a inactive install (a the WEBHOOK_SPEC §1.2 "a a
  // removed/deleted install → the receipt is logged, a the event is
  // DROPPED, a no enqueue, a audit").
  if (install.status !== "ACTIVE") {
    await writeReceipt(db, {
      installId: install.id,
      deliveryId: headers.deliveryId,
      event: "pull_request",
      orgId: install.orgId,
      accepted: false,
    });
    await audit(db, {
      orgId: install.orgId,
      action: "webhook.dropped_install_inactive",
      sourceIp: req.ip,
      meta: { githubInstallationId: installGhId, prNumber: pr.number },
    });
    reply.code(200).send({ ok: true, dropped: "install_inactive" });
    return;
  }

  const orgId = install.orgId;

  // A the repo resolution: a the `pull_request` carries a the
  // `repository.id` (a the GitHub repo id). A we find the `github_repos`
  // row for this org + repo.
  const githubRepoId = pr.repository.id;
  const repo = await db.githubRepo.findUnique({
    where: { orgId_githubRepoId: { orgId, githubRepoId: BigInt(githubRepoId) } },
  });

  // A the repo is not tracked (a we don't manage this repo) → a no-op. A
  // the receipt is written + a a audit; a no enqueue.
  if (!repo) {
    await writeReceipt(db, {
      installId: install.id,
      deliveryId: headers.deliveryId,
      event: "pull_request",
      orgId,
      accepted: false,
    });
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
  // commit"). A a SUCCEEDED job already exists for the key → 200 no-op + a
  // audit (a a re-enqueue would re-run the pipeline for a commit already
  // reviewed, a violating the idempotency invariant).
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
    await writeReceipt(db, {
      installId: install.id,
      deliveryId: headers.deliveryId,
      event: "pull_request",
      orgId,
      accepted: false,
    });
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

  // A the create / a the update of the `review_jobs` row (a the idempotency
  // key). A a non-succeeded existing job (a QUEUED / a RUNNING) is a
  // re-enqueue (a the idempotent pointer is reused; a the worker's dedup
  // catches the duplicate).
  let job = existing;
  if (!job) {
    job = await db.reviewJob.create({
      data: { orgId, repoId: repo.id, prNumber: pr.number, commitSha, status: "QUEUED" },
    });
  }

  // A the receipt (a the `webhook_deliveries` row, a the replay-dedup key,
  // a NFR-06). A written BEFORE the enqueue (a the "a verify + a receipt + a
  // enqueue" order, a the receipt is the durable proof of the delivery).
  await writeReceipt(db, {
    installId: install.id,
    deliveryId: headers.deliveryId,
    event: "pull_request",
    orgId,
    accepted: true,
  });

  // A the enqueue: a ONLY the `jobId` pointer + a the correlation fields
  // (a NFR-04 "a no LLM on this path"; a SERVICE_BOUNDARIES "a job payload
  // is a pointer, not an authority"). A the worker re-reads durable state.
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

// A the install-side event routing (a the `installation` / a
// `installation_repositories` — a the M3 T3.3 install flow, a repo
// discovery, a install removal). A this ingress path records the receipt
// + a drops with a audit (a no enqueue; a the install / a the repo state
// changes are the T3.3 upserts, a not the ingress).
async function routeInstallEvent(
  db: PrismaClient,
  req: FastifyRequest,
  reply: FastifyReply,
  event: string,
  data: { installation?: { id: number; account?: { type: string; login: string } } },
  headers: WebhookHeaders
) {
  // A the install row may or may not exist yet (a the install-created event
  // has no row; a the install-removed keeps the row). A a no receipt if the
  // install row is absent (a the FK can't be set; a the durable proof for
  // install-created is the `github_installs` upsert, a T3.3).
  if (data.installation) {
    const install = await db.githubInstall.findFirst({
      where: { githubInstallationId: String(data.installation.id) },
    });
    if (install) {
      await writeReceipt(db, {
        installId: install.id,
        deliveryId: headers.deliveryId,
        event,
        orgId: install.orgId,
      });
    }
  }
  // A the audit (a a every ingress event is logged, a WEBHOOK_SPEC §3).
  await audit(db, {
    action: `webhook.${event}`,
    sourceIp: req.ip,
    meta: { githubInstallationId: data.installation?.id != null ? String(data.installation.id) : null },
  });
  reply.code(202).send({ ok: true, event });
}

export default githubWebhookRoutes;
