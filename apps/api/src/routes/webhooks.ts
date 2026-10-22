// The GitHub webhook ingress route — M3's T3.2 / T3.3 (`POST /webhooks/github`).
//
// PUBLIC + non-session (WEBHOOK_SPECIFICATION §3 "the two public,
// non-session ingress routes"). The verify-then-handoff shape: HMAC →
// timestamp window → delivery dedup (`@vercode/github`'s
// `verifyGitHubWebhook` does layers 1–2 + the seen-check; layer 3's receipt
// write is this route's job, SERVICE_BOUNDARIES "a webhook route only does
// verify + receipt + enqueue"), then the event schema, then the routing.
//
// Ingress-time rules (WEBHOOK_SPECIFICATION §1.2 "the route only does
// verify + receipt + enqueue"; NFR-04 "no LLM, no diff fetch on the webhook
// path"):
// - `pull_request` opened/reopened/synchronize → resolve install→org, the
//   commit-SHA idempotency (ADR-007: a SUCCEEDED job for the key → 200
//   no-op + audit, IT-idempotency-01), a new `review_jobs` row, a
//   `review-queue` enqueue (the payload is ONLY the `jobId` pointer +
//   correlation fields, SERVICE_BOUNDARIES "a job payload is a pointer,
//   not an authority"), 202.
// - `installation` created → record the install + upsert the repos.
// - `installation` deleted → mark REMOVED + disconnect repos + a
//   `retention_jobs` purge row (AC-204).
// - `installation_repositories` added/removed → upsert / disable the repos.
// - an unknown install (a verified event we never recorded) → 404 + audit,
//   not 200 (no existence oracle, WEBHOOK_SPECIFICATION §1.2 "the sender
//   can notice").
//
// The audit rows (every rejection is audited, WEBHOOK_SPECIFICATION §3 "a
// forged-webhook attempt is investigable"): `webhook.rejected` on a 401,
// `webhook.malformed` on a 422, `webhook.replay` on a seen delivery,
// `webhook.dropped_install_inactive` on a removed-install drop.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@vercode/config";
import {
  verifyGitHubWebhook,
  validateEventBody,
  type PullRequestEvent,
  type InstallationEvent,
  type InstallationRepositoriesEvent,
} from "@vercode/github";
import { Prisma, PrismaClient } from "@prisma/client";
import type { Enqueueable, ReviewJobPayload } from "../queue.js";

// The raw-body channel: the content-type parser stashes the raw string on
// the request (the HMAC source of truth — the route never re-serializes for
// the signature check).
declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

// The audit actor id (a webhook is not a user; the audit table requires an
// actor, so a fixed system actor names the ingress itself).
const WEBHOOK_ACTOR = "github.webhook";

// The no-queue default: even without a queue the route writes the durable
// review_jobs row (the worker's re-drain picks it up — BACKUP_RESTORE §1,
// "a queue loss is a re-drain from the DB; the durable row is the source
// of truth").
const defaultNoopQueue: Enqueueable = {
  enqueue: async () => ({ enqueued: false, reason: "degraded_no_redis" }),
};

export interface GithubWebhookDeps {
  /** A mocked PrismaClient for the route test (no Postgres). */
  db?: PrismaClient;
  /** An in-memory queue for the route test (no Redis). */
  queue?: Enqueueable;
}

export function githubWebhookRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: GithubWebhookDeps = {}
) {
  // The db + queue are injected (a mocked PrismaClient + an in-memory queue
  // in the test; the real client + a BullQueue from `registerRoutes` in
  // prod — the BullQueue degrades to a no-op enqueue + a warning when the
  // REDIS_URL is unreachable, the dev-stack rule).
  const db: PrismaClient = deps.db ?? new PrismaClient();
  const queue: Enqueueable = deps.queue ?? defaultNoopQueue;
  const secret = config.github.GITHUB_WEBHOOK_SECRET;

  async function audit(
    reply: FastifyReply,
    data: { orgId?: string | null; action: string; targetId?: string | null; meta?: Record<string, unknown> }
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
        /* an audit-write failure never fails the ingress response */
      });
  }

  // The raw-body parser (the HMAC is computed over the *raw* bytes, not a
  // re-serialized object — the same invariant as the billing route).
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req: FastifyRequest, payload: Buffer, done: (err: Error | null, value: unknown) => void) => {
      const raw = payload.toString("utf8");
      (_req as unknown as { rawBody?: string }).rawBody = raw;
      try {
        done(null, raw.length ? JSON.parse(raw) : {});
      } catch {
        done(null, {});
      }
    }
  );

  app.post(
    "/github",
    { schema: { config: { public: true } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      // The HMAC is computed over the *raw* body (WEBHOOK_SPECIFICATION
      // §1.1 "the raw request body"), not a re-serialized object. The
      // raw-body parser stashes it on `req.rawBody`.
      const raw = req.rawBody ?? JSON.stringify(req.body ?? {});

      const headers = {
        signature: (req.headers["x-hub-signature-256"] as string | undefined) ?? "",
        deliveryId: (req.headers["x-hub-delivery"] as string | undefined) ?? "",
        timestamp: (req.headers["x-hub-timestamp"] as string | undefined) ?? "",
        event: (req.headers["x-github-event"] as string | undefined) ?? "",
      };

      // Layer 3 lookup: is the delivery id already seen in
      // `webhook_deliveries` (the 24 h replay-dedup window, NFR-06)?
      const deliverySeen = headers.deliveryId
        ? (await db.webhookDelivery.findUnique({ where: { deliveryId: headers.deliveryId } })) !== null
        : false;

      // Layers 1–2 (HMAC + timestamp window) via `@vercode/github`. A
      // signature/timestamp failure → 401 + audit, NO queue write
      // (ST-webhook-forged / ST-webhook-stale, THREAT_MODEL T-01).
      const verdict = verifyGitHubWebhook(headers, raw, secret, {
        isDeliverySeen: () => deliverySeen,
      });
      if (!verdict.ok) {
        // A replay (a seen delivery id that also passed HMAC + timestamp —
        // the 24 h dedup layer) → 200 no-op (the pipeline does NOT re-run,
        // ST-webhook-replay). The `webhook_deliveries` row already exists.
        if (verdict.reason === "replay") {
          await audit(reply, {
            action: "webhook.replay",
            targetId: headers.deliveryId,
            meta: { event: headers.event, deliveryId: headers.deliveryId },
          });
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
          error: { code: "WEBHOOK_REJECTED", message: "Webhook signature or timestamp verification failed." },
        });
        return;
      }

      // A the delivery receipt (a the `webhook_deliveries` row, a the
      // replay-dedup key, a NFR-06 "a 100% rejection of forged/replayed
      // webhooks (a the delivery-dedup table)"). A the receipt is written
      // AFTER the install resolution (a the FK needs a real install, a
      // the "pending" placeholder is a not-a-FK, a the schema's
      // `install_id` is a non-nullable FK to `github_installs.id`); a the
      // replay-dedup for the ingress is the layer-3 read above (a a
      // `webhookDelivery.findUnique` for the delivery id, a a seen row →
      // the "replay" verdict, a a 200 no-op).

      // A the body schema (WEBHOOK_SPECIFICATION §1.3 "a verified but
      // malformed body → 422 + audit + not enqueued"). The signature proves
      // origin; the schema proves shape — both are required.
      const { ok, data } = validateEventBody(headers.event, req.body);
      if (!ok) {
        await audit(reply, {
          action: "webhook.malformed",
          targetId: headers.deliveryId,
          meta: { event: headers.event },
        });
        reply.code(422).send({
          error: { code: "WEBHOOK_MALFORMED", message: "Event body failed the schema." },
        });
        return;
      }

      switch (headers.event) {
        case "pull_request":
          await handlePullRequest(db, queue, data as PullRequestEvent, reply, { deliveryId: headers.deliveryId });
          break;
        case "installation":
          await handleInstallation(db, data as InstallationEvent, reply);
          break;
        case "installation_repositories":
          await handleInstallationRepositories(db, data as InstallationRepositoriesEvent, reply);
          break;
        default:
          // A verified event in no known schema (unknown to the MVP set)
          // is already rejected above; this branch is a receipt-only ack.
          reply.code(202).send({ ok: true, event: headers.event, receipt: true });
          return;
      }

      reply.code(202).send({ ok: true, event: headers.event, deliveryId: headers.deliveryId });
    }
  );
}

// ---------------------------------------------------------------------------
// The `pull_request` routing (opened / reopened / synchronize → the
// commit-SHA idempotency + the enqueue; closed / edited → a receipt-only
// no-op for the MVP — the terminal-marking of in-flight jobs is the M4 path,
// INTEGRATION_DESIGN §1.4 "pull_request closed → mark job terminal").
// ---------------------------------------------------------------------------

// The receipt write (the `webhook_deliveries` row, the replay-dedup key,
// NFR-06 "a 100% rejection of forged/replayed webhooks (the delivery-
// dedup table)"). Written AFTER the install resolution with real install
// + org ids (the `install_id` FK is non-nullable — a "pending"
// placeholder would violate the FK in a real DB). A duplicate delivery
// id (a concurrent replay) → the unique key rejects; we swallow that
// (the receipt is already durable, not an error).
async function writeReceipt(
  db: PrismaClient,
  opts: { installId: string; deliveryId: string; event: string; orgId: string; accepted?: boolean }
): Promise<void> {
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
      /* a duplicate delivery id (a replay) — the row already exists; the
         receipt is durable, not an error. */
    });
}

async function handlePullRequest(
  db: PrismaClient,
  queue: Enqueueable,
  evt: PullRequestEvent,
  reply: FastifyReply,
  ctx: { deliveryId: string }
): Promise<void> {
  const action = evt.action;
  // Only the review-triggering actions enqueue (WEBHOOK_SPECIFICATION §1.2
  // "opened/reopened/synchronize"). closed/edited are receipt-only here.
  const triggerReview = action === "opened" || action === "reopened" || action === "synchronize";

  // The install→org resolution (github_installs by installation.id). An
  // unknown install → 404 + audit (no existence oracle — the sender can
  // notice; a 200 would mask the gap, WEBHOOK_SPECIFICATION §1.2).
  const install = await db.githubInstall.findFirst({
    where: { githubInstallationId: String(evt.installation.id) },
    include: { repos: true },
  });
  if (!install) {
    await db.auditEvent
      .create({
        data: {
          orgId: null,
          actorId: WEBHOOK_ACTOR,
          action: "webhook.unknown_install",
          targetId: String(evt.installation.id),
          sourceIp: reply.request.ip,
          meta: {
            event: "pull_request",
            action,
            installationId: evt.installation.id,
            deliveryId: ctx.deliveryId,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});
    reply.code(404).send({
      error: { code: "WEBHOOK_UNKNOWN_INSTALL", message: "Installation is not registered." },
    });
    return;
  }

  // A removed/deleted org, or a REMOVED install → the event is *dropped*
  // (receipt logged, no enqueue, WEBHOOK_SPECIFICATION §1.2 "a webhook
  // whose install resolves to a removed/deleted org → the event is dropped
  // + a webhook.dropped_install_inactive audit"; AC-204).
  const org = await db.organization.findFirst({
    where: { id: install.orgId, status: { not: "DELETED" } },
  });
  if (!org) {
    await db.auditEvent
      .create({
        data: {
          orgId: install.orgId,
          actorId: WEBHOOK_ACTOR,
          action: "webhook.dropped_install_inactive",
          targetId: install.id,
          sourceIp: reply.request.ip,
          meta: {
            event: "pull_request",
            installationStatus: install.status,
            deliveryId: ctx.deliveryId,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});
    reply.code(200).send({ ok: true, dropped: "install_inactive" });
    return;
  }
  if (install.status === "REMOVED") {
    await db.auditEvent
      .create({
        data: {
          orgId: org.id,
          actorId: WEBHOOK_ACTOR,
          action: "webhook.dropped_install_inactive",
          targetId: install.id,
          sourceIp: reply.request.ip,
          meta: { event: "pull_request", reason: "install_removed", deliveryId: ctx.deliveryId } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});
    reply.code(200).send({ ok: true, dropped: "install_removed" });
    return;
  }

  // The repo row (the PR event's repository.id → the github_repos row, the
  // tenant-scoped unique key (orgId, githubRepoId)). An untracked/disabled
  // repo → a drop + audit (the install is known; the repo is out of scope).
  const repo = await db.githubRepo.findUnique({
    where: {
      orgId_githubRepoId: { orgId: org.id, githubRepoId: BigInt(evt.repository.id) },
    },
  });
  if (!repo || !repo.connected) {
    await db.auditEvent
      .create({
        data: {
          orgId: org.id,
          actorId: WEBHOOK_ACTOR,
          action: "webhook.dropped_repo_untracked",
          targetId: String(evt.repository.id),
          sourceIp: reply.request.ip,
          meta: {
            event: "pull_request",
            fullName: evt.repository.full_name,
            deliveryId: ctx.deliveryId,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});
    reply.code(200).send({ ok: true, dropped: "repo_untracked" });
    return;
  }

  // Non-triggering actions (closed/edited): receipt only, no enqueue. The
  // M4 path marks in-flight jobs terminal + stops publishing.
  if (!triggerReview) {
    reply.code(202).send({ ok: true, event: "pull_request", receipt: true, action });
    return;
  }

  const commitSha = evt.pull_request.head.sha;

  // A the receipt (a the `webhook_deliveries` row, a the replay-dedup
  // key, a NFR-06). A written BEFORE the enqueue (a the "a verify + a
  // receipt + a enqueue" order; a the receipt is the durable proof of
  // the delivery, a a real install + a org id, a not a placeholder).
  await writeReceipt(db, {
    installId: install.id,
    deliveryId: ctx.deliveryId,
    event: "pull_request",
    orgId: org.id,
    accepted: true,
  });

  // THE commit-SHA idempotency (ADR-007, the `review_jobs`
  // `(orgId, repoId, prNumber, commitSha)` unique key; IT-idempotency-01
  // "a same-SHA no-op, a new SHA a new job"). A SUCCEEDED job for the key →
  // 200 no-op + audit (a re-push to the *same* SHA is a no-op).
  const existing = await db.reviewJob.findUnique({
    where: {
      orgId_repoId_prNumber_commitSha: {
        orgId: org.id,
        repoId: repo.id,
        prNumber: evt.number,
        commitSha,
      },
    },
  });
  if (existing && existing.status === "SUCCEEDED") {
    await db.auditEvent
      .create({
        data: {
          orgId: org.id,
          actorId: WEBHOOK_ACTOR,
          action: "webhook.dedup_same_sha",
          targetId: existing.id,
          sourceIp: reply.request.ip,
          meta: {
            commitSha,
            prNumber: evt.number,
            repoId: repo.id,
            deliveryId: ctx.deliveryId,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});
    reply.code(200).send({ ok: true, dedup: true, jobId: existing.id, commitSha });
    return;
  }

  // Create / reuse the review_jobs row. An in-flight or non-SUCCEEDED row
  // for the key is reused — a synchronize onto a QUEUED/RUNNING/FAILED job
  // is a re-enqueue, not a new row (the idempotency key is respected: no
  // duplicate row; the row's status is reset to QUEUED for the re-run).
  const job =
    existing ??
    (await db.reviewJob.create({
      data: {
        orgId: org.id,
        repoId: repo.id,
        prNumber: evt.number,
        commitSha,
        status: "QUEUED",
      },
    }));

  if (existing && existing.status !== "SUCCEEDED") {
    await db.reviewJob.update({ where: { id: job.id }, data: { status: "QUEUED" } });
  }

  // The enqueue (the payload is ONLY the pointer + correlation — the
  // worker re-reads the org/quota/settings, SERVICE_BOUNDARIES "a job
  // payload is a pointer, not an authority").
  const payload: ReviewJobPayload = {
    jobId: job.id,
    orgId: org.id,
    repoId: repo.id,
    prNumber: evt.number,
    commitSha,
    deliveryId: ctx.deliveryId,
  };
  const enq = await queue.enqueue(payload as unknown as Record<string, unknown>);

  await db.auditEvent
    .create({
      data: {
        orgId: org.id,
        actorId: WEBHOOK_ACTOR,
        action: "webhook.review_enqueued",
        targetId: job.id,
        sourceIp: reply.request.ip,
        meta: {
          commitSha,
          prNumber: evt.number,
          action: evt.action,
          enqueued: enq.enqueued,
          deliveryId: ctx.deliveryId,
        } as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});

  reply.code(202).send({
    ok: true,
    jobId: job.id,
    enqueued: enq.enqueued,
    commitSha,
  });
}

// ---------------------------------------------------------------------------
// The `installation` routing (created → record + repo discover; deleted →
// the AC-204: REMOVED + repos disconnected + the retention_jobs purge row).
// ---------------------------------------------------------------------------

async function handleInstallation(
  db: PrismaClient,
  evt: InstallationEvent,
  reply: FastifyReply
): Promise<void> {
  if (evt.action === "created") {
    // The install → org. The org is resolved by the account login (the M2
    // org-creation flow mints the org; this route assumes it exists — the
    // install URL flow, INTEGRATION_DESIGN §1.2, creates it first). An
    // unknown org → no install row + an operator-gap audit (not a
    // security event).
    const org = await db.organization.findFirst({
      where: { slug: evt.installation.account.login.toLowerCase() },
    });
    if (!org) {
      await db.auditEvent
        .create({
          data: {
            orgId: null,
            actorId: WEBHOOK_ACTOR,
            action: "webhook.install_unknown_org",
            targetId: String(evt.installation.id),
            sourceIp: reply.request.ip,
            meta: { account: evt.installation.account.login } as Prisma.InputJsonValue,
          },
        })
        .catch(() => {});
      return;
    }

    const installRow = await db.githubInstall.upsert({
      where: {
        orgId_githubInstallationId: {
          orgId: org.id,
          githubInstallationId: String(evt.installation.id),
        },
      },
      update: { status: "ACTIVE", removedAt: null },
      create: {
        orgId: org.id,
        githubInstallationId: String(evt.installation.id),
        accountType: evt.installation.account.type,
        accountLogin: evt.installation.account.login,
        status: "ACTIVE",
      },
    });

    // The repo discover (the install payload carries the repo ids when
    // `repository_selection` is "selected"; the full GitHub-API discover is
    // the M2 surface — the ingress records what the event gives).
    if (evt.installation.repositories?.length) {
      for (const r of evt.installation.repositories) {
        await upsertRepoRow(db, org.id, installRow.id, { id: r.id, full_name: "", default_branch: "main" });
      }
    }
    return;
  }

  // deleted → AC-204 (ACCEPTANCE_CRITERIA "on installation.deleted, the
  // install row is marked inactive; repos flag disconnected; queued jobs
  // for that install transition to skipped: install_removed; repo content
  // scheduled for purge; audit event github.install_removed"):
  // the install row → REMOVED + removedAt; the repos → disconnected +
  // disabledAt; a retention_jobs purge row (DATA_RETENTION §4 "an
  // install-removal evicts the org's diff cache + schedules the content
  // purge"); the audit row.
  const install = await db.githubInstall.findFirst({
    where: { githubInstallationId: String(evt.installation.id) },
  });
  if (!install) {
    await db.auditEvent
      .create({
        data: {
          orgId: null,
          actorId: WEBHOOK_ACTOR,
          action: "webhook.install_unknown_org",
          targetId: String(evt.installation.id),
          sourceIp: reply.request.ip,
          meta: { action: "deleted" } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});
    return;
  }

  await db.githubInstall.update({
    where: { id: install.id },
    data: { status: "REMOVED", removedAt: new Date() },
  });
  await db.githubRepo.updateMany({
    where: { installId: install.id },
    data: { connected: false, disabledAt: new Date() },
  });
  await db.retentionJob.create({
    data: {
      orgId: install.orgId,
      kind: "install_content_purge",
      target: String(evt.installation.id),
      runAt: new Date(),
      status: "PENDING",
    },
  });
  await db.auditEvent
    .create({
      data: {
        orgId: install.orgId,
        actorId: WEBHOOK_ACTOR,
        action: "github.install_removed",
        targetId: install.id,
        sourceIp: reply.request.ip,
        meta: {
          githubInstallationId: String(evt.installation.id),
        } as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// The `installation_repositories` routing (added → upsert; removed →
// disable). FR-202 "the install's repo selection is the tenancy boundary".
// ---------------------------------------------------------------------------

async function handleInstallationRepositories(
  db: PrismaClient,
  evt: InstallationRepositoriesEvent,
  _reply: FastifyReply
): Promise<void> {
  const install = await db.githubInstall.findFirst({
    where: { githubInstallationId: String(evt.installation.id) },
  });
  if (!install) return;

  const now = new Date();
  if (evt.action === "added" && evt.repositories_added?.length) {
    for (const r of evt.repositories_added) {
      await upsertRepoRow(db, install.orgId, install.id, {
        id: r.id,
        full_name: r.full_name,
        default_branch: r.default_branch,
      });
    }
    return;
  }

  if (evt.action === "removed" && evt.repositories_removed?.length) {
    for (const r of evt.repositories_removed) {
      await db.githubRepo.updateMany({
        where: {
          orgId: install.orgId,
          githubRepoId: BigInt(r.id),
        },
        data: { connected: false, disabledAt: now },
      });
    }
  }
}

// An upsert of a github_repos row (the (orgId, githubRepoId) tenant-scoped
// unique key, DATABASE_DESIGN §8 "every tenant-owned table carries org_id").
async function upsertRepoRow(
  db: PrismaClient,
  orgId: string,
  installId: string,
  repo: { id: number; full_name: string; default_branch: string }
): Promise<void> {
  await db.githubRepo.upsert({
    where: {
      orgId_githubRepoId: { orgId, githubRepoId: BigInt(repo.id) },
    },
    update: { connected: true, disabledAt: null, fullName: repo.full_name },
    create: {
      orgId,
      installId,
      githubRepoId: BigInt(repo.id),
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      connected: true,
    },
  });
}
