// The GitHub webhook ingress route — M3's T3.2 (`POST /webhooks/github`).
//
// PUBLIC + non-session (a WEBHOOK_SPECIFICATION §3 "the two public,
// non-session ingress routes"). The verify-then-handoff shape: HMAC →
// timestamp window → delivery dedup (`@vercode/github`'s
// `verifyGitHubWebhook` does layers 1–2 + the seen-check; layer 3's receipt
// write is this route's job, a SERVICE_BOUNDARIES "the webhook route only
// does verify + receipt + enqueue"), then the event schema, then the routing.
//
// Ingress-time rules (a WEBHOOK_SPECIFICATION §1.2 "the route only does
// verify + receipt + enqueue"; a NFR-04 "no LLM, no diff fetch on the
// webhook path"):
// - a unknown install (a verified event we never recorded) → 404 + audit,
//   a not 200 (a "no existence oracle", a WEBHOOK_SPECIFICATION §1.2 "the
//   sender can notice").
// - a removed/inactive install → the receipt is logged, a the event is
//   DROPPED (a not enqueued), a audit `webhook.dropped_install_inactive`.
// - a SUCCEEDED job already exists for the commit-SHA idempotency key →
//   200 no-op + audit (a ADR-007 "a one completed review per commit").
// - `pull_request` opened/reopened/synchronize → resolve install→org, a
//   `review_jobs` row (a the commit-SHA idempotency key), a the
//   `review-queue` enqueue (a the payload is ONLY the `jobId` pointer +
//   correlation fields, a SERVICE_BOUNDARIES "a job payload is a pointer,
//   not an authority" — a the worker re-reads durable state, a never trusts
//   the payload for authz), 202.
// - the `installation` / a the `installation_repositories` events record
//   the receipt only at the ingress (a the install upsert / a the repo
//   discovery / a the install-removal + a the retention purge are the M2
//   install-flow surface in `routes/github.ts` + a the T3.3 glue; a the
//   ingress stays verify + receipt + enqueue, a NFR-04).
//
// The audit rows (a every rejection is audited, a WEBHOOK_SPECIFICATION §3
// "a forged-webhook attempt is investigable"): `webhook.rejected` on a 401,
// `webhook.malformed` on a 422, `webhook.unknown_install` on a 404.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@vercode/config";
import {
  verifyGitHubWebhook,
  validateEventBody,
  type PullRequestEvent,
} from "@vercode/github";
import { Prisma, PrismaClient } from "@prisma/client";
import type { Enqueueable, ReviewJobPayload } from "../queue.js";

// The audit actor id (a webhook is not a user; the audit table requires
// an actor, a fixed system actor names the ingress itself).
const WEBHOOK_ACTOR = "github.webhook";

export interface GithubWebhookDeps {
  /** The DB surface (a the real PrismaClient in prod, a a mock in tests). */
  db?: PrismaClient;
  /** The queue surface (a the BullQueue in prod, a the in-memory fake in
   * tests). A a no-queue default no-ops + a the durable review_jobs row is
   * the source of truth (a BACKUP_RESTORE §1 "a a queue loss is a
   * re-drain from the DB"). */
  queue?: Enqueueable;
}

export function githubWebhookRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: GithubWebhookDeps = {}
) {
  // A the db + a queue are injected (a a mocked PrismaClient + a in-memory
  // queue for the route test, a no Redis + a no Postgres). A the prod build
  // passes the real client + a BullQueue from `registerRoutes` (a it
  // degrades to a no-op enqueue + a warning when the REDIS_URL is
  // unreachable in the dev-stack, a so the ingress stays up).
  const db = deps.db ?? new PrismaClient();
  const queue: Enqueueable =
    deps.queue ?? {
      // A the no-queue default: a the ingress no-ops the enqueue (a the
      // durable review_jobs row is the source of truth; a the worker's
      // re-drain picks it up, a BACKUP_RESTORE §1).
      enqueue: async () => ({ enqueued: false, reason: "degraded_no_redis" }),
    };
  const secret = config.github.GITHUB_WEBHOOK_SECRET;

  async function audit(
    reply: FastifyReply,
    data: {
      orgId?: string | null;
      action: string;
      targetId?: string | null;
      meta?: Record<string, unknown>;
    }
  ): Promise<void> {
    await db.auditEvent
      .create({
        data: {
          orgId: data.orgId ?? null,
          actorId: WEBHOOK_ACTOR,
          action: data.action,
          targetId: data.targetId ?? null,
          sourceIp: reply.request.ip,
          meta: (data.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      })
      .catch(() => {
        /* a audit-write failure never fails the ingress response */
      });
  }

  // A the receipt write (a the `webhook_deliveries` row, a the replay-dedup
  // key, a NFR-06 "a 100% rejection of forged/replayed webhooks (a the
  // delivery-dedup table)"). A a duplicate delivery id (a a replay) → the
  // unique key rejects; a we swallow that (a the receipt is already
  // durable, a not an error).
  async function writeReceipt(opts: {
    installId: string;
    deliveryId: string;
    event: string;
    orgId: string;
    accepted?: boolean;
  }): Promise<void> {
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
        /* a a duplicate delivery id (a a replay) — a the row already
           exists; a the receipt is durable, a not an error. */
      });
  }

  // A the raw-body parser (a the HMAC is computed over the *raw* bytes, a
  // not a re-serialized object — a re-serialization can change the byte
  // order + a fail the HMAC, a WEBHOOK_SPECIFICATION §1.1 "computed over
  // the raw request body"). a The parser hands the parsed JSON to the route
  // (a `req.body`) + a stashes the raw string on the request.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req: FastifyRequest, payload: Buffer, done: (err: unknown, value: unknown) => void) => {
      const raw = payload.toString("utf8");
      (req as unknown as { rawBody?: string }).rawBody = raw;
      try {
        done(null, raw.length ? JSON.parse(raw) : {});
      } catch {
        // A a non-JSON body: a the signature check will likely fail (a a
        // GitHub webhook is JSON). a A {} keeps the route logic from
        // crashing on a undefined body.
        done(null, {});
      }
    }
  );

  app.post(
    "/github",
    { schema: { config: { public: true } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      // A raw body: a the HMAC source of truth (a the parser stashed it).
      const raw = (req as unknown as { rawBody?: string }).rawBody ?? "";

      const headers = {
        signature: (req.headers["x-hub-signature-256"] as string | undefined) ?? "",
        deliveryId: (req.headers["x-hub-delivery"] as string | undefined) ?? "",
        timestamp: (req.headers["x-hub-timestamp"] as string | undefined) ?? "",
        event: (req.headers["x-github-event"] as string | undefined) ?? "",
      };

      // A layer 3 lookup (a the delivery dedup): a the `webhook_deliveries`
      // row for the delivery id (a the 24 h window, a NFR-06). A a seen id
      // → the "replay" verdict (a the route turns it into a 200 no-op, a
      // ST-webhook-replay, a the pipeline does NOT re-run).
      const deliverySeen = headers.deliveryId
        ? (await db.webhookDelivery.findUnique({ where: { deliveryId: headers.deliveryId } })) !== null
        : false;

      // A layers 1–2: a HMAC + a timestamp window (a `@vercode/github`). A
      // a signature / a timestamp failure → 401 + a audit + NO queue write
      // (a ST-webhook-forged / a -stale, a THREAT_MODEL T-01 "a forged
      // event fails layer 1").
      const verdict = verifyGitHubWebhook(headers, raw, secret, {
        isDeliverySeen: () => deliverySeen,
      });
      if (!verdict.ok) {
        if (verdict.reason === "replay") {
          reply.code(200).send({ ok: true, replay: true, deliveryId: headers.deliveryId });
          return;
        }
        await audit(reply, {
          action: "webhook.rejected",
          meta: {
            reason: verdict.reason ?? "signature",
            event: headers.event,
            deliveryId: headers.deliveryId,
          },
        });
        reply.code(401).send({
          error: { code: "WEBHOOK_REJECTED", message: "Signature or timestamp verification failed." },
        });
        return;
      }

      // A the verified event (a a signature + a timestamp both passed). A
      // the body shape check (a the EVENT_SCHEMAS, a a "a verified but
      // malformed body → 422 + a not enqueued + a audited", a WEBHOOK_SPEC
      // §1.3 "a signature proves origin; a schema proves shape").
      const valid = validateEventBody(headers.event, req.body);
      if (!valid.ok) {
        await audit(reply, {
          action: "webhook.malformed",
          meta: { event: headers.event, deliveryId: headers.deliveryId },
        });
        reply.code(422).send({
          error: { code: "WEBHOOK_MALFORMED", message: "Event body failed the event schema." },
        });
        return;
      }

      // A the routing (a WEBHOOK_SPECIFICATION §1.2 "event routing").
      if (headers.event === "pull_request") {
        await routePullRequest(db, queue, valid.data as PullRequestEvent, reply, headers, writeReceipt, audit);
        return;
      }

      // A the install-side events (a the `installation` / a the
      // `installation_repositories`). A the ingress records the receipt
      // only when the install row exists (a a install-created event has no
      // row yet; a the upsert is the M2 install-flow's job, a the durable
      // proof is the github_installs row, a not the receipt). a No enqueue,
      // a NFR-04.
      if (headers.event === "installation" || headers.event === "installation_repositories") {
        const installData = valid.data as { installation?: { id: number } };
        if (installData.installation) {
          const install = await db.githubInstall.findFirst({
            where: { githubInstallationId: String(installData.installation.id) },
          });
          if (install) {
            await writeReceipt({
              installId: install.id,
              deliveryId: headers.deliveryId,
              event: headers.event,
              orgId: install.orgId,
            });
          }
        }
        reply.code(200).send({ ok: true, event: headers.event, receipt: true });
        return;
      }

      // A a unknown / a unhandled event (a verified but not-routed) → a 200
      // receipt-only (a a sender that noticed is a good thing, a not a 404
      // oracle).
      reply.code(200).send({ ok: true, event: headers.event, unrouted: true });
    }
  );
}

// ---------------------------------------------------------------------------
// The `pull_request` routing: a the install → a the org resolution + a the
// commit-SHA idempotency + a the enqueue.
// ---------------------------------------------------------------------------

async function routePullRequest(
  db: PrismaClient,
  queue: Enqueueable,
  pr: PullRequestEvent,
  reply: FastifyReply,
  headers: { signature: string; deliveryId: string; timestamp: string; event: string },
  writeReceipt: (opts: {
    installId: string;
    deliveryId: string;
    event: string;
    orgId: string;
    accepted?: boolean;
  }) => Promise<void>,
  audit: (
    reply: FastifyReply,
    data: { orgId?: string | null; action: string; targetId?: string | null; meta?: Record<string, unknown> }
  ) => Promise<void>
): Promise<void> {
  const action = pr.action;

  // A only the review-triggering actions enqueue (a WEBHOOK_SPECIFICATION
  // §1.2 "a opened/reopened/synchronize"; a `closed` / a `edited` are a
  // receipt-only, a the close-marking is a M4's T4.1).
  const triggerReview = action === "opened" || action === "reopened" || action === "synchronize";

  // A the install → a the org resolution (a the `github_installs` row, a
  // keyed by `githubInstallationId`). A a unknown install → 404 + a audit
  // (a "no existence oracle", a WEBHOOK_SPEC §1.2 "a unknown install →
  // 404 + a audit").
  const install = await db.githubInstall.findFirst({
    where: { githubInstallationId: String(pr.installation.id) },
  });
  if (!install) {
    await audit(reply, {
      action: "webhook.unknown_install",
      targetId: String(pr.installation.id),
      meta: {
        event: "pull_request",
        action,
        githubInstallationId: pr.installation.id,
        deliveryId: headers.deliveryId,
      },
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
    await writeReceipt({
      installId: install.id,
      deliveryId: headers.deliveryId,
      event: "pull_request",
      orgId: install.orgId,
      accepted: false,
    });
    await audit(reply, {
      orgId: install.orgId,
      action: "webhook.dropped_install_inactive",
      targetId: install.id,
      meta: { githubInstallationId: String(pr.installation.id), prNumber: pr.number },
    });
    reply.code(200).send({ ok: true, dropped: "install_inactive" });
    return;
  }

  const orgId = install.orgId;

  // A the repo resolution: a the `pull_request` carries a the
  // `repository.id` (a the GitHub repo id). A we find the `github_repos`
  // row for this org + repo.
  const repo = await db.githubRepo.findUnique({
    where: {
      orgId_githubRepoId: { orgId, githubRepoId: BigInt(pr.repository.id) },
    },
  });
  if (!repo || !repo.connected) {
    // A a verified event against a repo we don't track (a it was never
    // discovered, a it was removed, a a foreign repo on the install) → a
    // drop + a audit, a not a 404 (a the *install* is known; a it's the
    // *repo* that's out of scope).
    await writeReceipt({
      installId: install.id,
      deliveryId: headers.deliveryId,
      event: "pull_request",
      orgId,
      accepted: false,
    });
    await audit(reply, {
      orgId,
      action: "webhook.dropped_repo_untracked",
      targetId: String(pr.repository.id),
      meta: { fullName: pr.repository.full_name, prNumber: pr.number },
    });
    reply.code(200).send({ ok: true, dropped: "repo_not_tracked" });
    return;
  }

  // A a non-triggering action (a `closed` / a `edited`) → a receipt-only, a
  // no enqueue (a the close-marking is a M4's T4.1 "a PR closed during
  // review → a the in-flight job is marked terminal; a stop publishing").
  if (!triggerReview) {
    await writeReceipt({
      installId: install.id,
      deliveryId: headers.deliveryId,
      event: "pull_request",
      orgId,
      accepted: false,
    });
    reply.code(202).send({ ok: true, event: "pull_request", receipt: true, action });
    return;
  }

  const commitSha = pr.pull_request.head.sha;

  // A THE commit-SHA idempotency (a ADR-007 "a one completed review per
  // commit"). A a SUCCEEDED job already exists for the key → 200 no-op +
  // audit (a a re-push to the *same* SHA is a no-op, a no re-review; a the
  // re-enqueue would violate the idempotency invariant).
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
    await writeReceipt({
      installId: install.id,
      deliveryId: headers.deliveryId,
      event: "pull_request",
      orgId,
      accepted: false,
    });
    await audit(reply, {
      orgId,
      action: "webhook.already_reviewed",
      targetId: existing.id,
      meta: { prNumber: pr.number, commitSha },
    });
    reply.code(200).send({ ok: true, alreadyReviewed: true, jobId: existing.id, commitSha });
    return;
  }

  // A the create / a the reuse of a `review_jobs` row (a the idempotency
  // key). A a non-SUCCEEDED existing row (a QUEUED / a RUNNING / a FAILED)
  // is a reused (a a synchronize onto an in-flight job is a re-enqueue, a
  // not a new row; a the worker's dedup + a the in-flight lock catches the
  // duplicate, a NFR-13).
  const job =
    existing ??
    (await db.reviewJob.create({
      data: { orgId, repoId: repo.id, prNumber: pr.number, commitSha, status: "QUEUED" },
    }));

  // A the receipt (a the `webhook_deliveries` row, a the replay-dedup key,
  // a NFR-06). A written BEFORE the enqueue (a the "a verify + a receipt +
  // a enqueue" order, a the receipt is the durable proof of the delivery).
  await writeReceipt({
    installId: install.id,
    deliveryId: headers.deliveryId,
    event: "pull_request",
    orgId,
    accepted: true,
  });

  // A the enqueue (a ONLY the `jobId` pointer + a the correlation fields —
  // a NFR-04 "a no LLM on this path"; a SERVICE_BOUNDARIES "a job payload
  // is a pointer, not an authority" — a the worker re-reads the durable
  // state + a never trusts the payload for authz).
  const payload: ReviewJobPayload = {
    jobId: job.id,
    orgId,
    repoId: repo.id,
    prNumber: pr.number,
    commitSha,
    deliveryId: headers.deliveryId,
  };
  const enq = await queue.enqueue(payload as unknown as Record<string, unknown>);

  reply.code(202).send({
    ok: true,
    jobId: job.id,
    enqueued: enq.enqueued,
    prNumber: pr.number,
    commitSha,
  });
}

export default githubWebhookRoutes;
