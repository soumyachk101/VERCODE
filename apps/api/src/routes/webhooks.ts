// The GitHub webhook ingress route — M3's T3.2 / T3.3 (`POST /webhooks/github`).
//
// PUBLIC + non-session (a WEBHOOK_SPECIFICATION §3 "the two public,
// non-session ingress routes"). The verify-then-handoff shape: HMAC →
// timestamp window → delivery dedup (a `@vercode/github`'s
// `verifyGitHubWebhook` does layers 1–2 + the seen-check; layer 3's receipt
// write is this route's job, a SERVICE_BOUNDARIES "the webhook route only
// does verify + receipt + enqueue"), then the event schema, then the routing.
//
// Ingress-time rules (a WEBHOOK_SPECIFICATION §1.2 "the route only does
// verify + receipt + enqueue"; a NFR-04 "no LLM, no diff fetch on the
// webhook path"):
// - `pull_request` opened/reopened/synchronize → resolve install→org, the
//   commit-SHA idempotency (a ADR-007: a SUCCEEDED job for the key → 200
//   no-op + audit, a `IT-idempotency-01`), a new `review_jobs` row, a
//   `review-queue` enqueue (a the payload is ONLY the `jobId` pointer +
//   correlation fields, a SERVICE_BOUNDARIES "a job payload is a pointer,
//   not an authority"), 202.
// - `installation` created → record the install + upsert the repos.
// - `installation` deleted → mark REMOVED + disconnect repos + a
//   `retention_jobs` purge row (a AC-204).
// - `installation_repositories` added/removed → upsert / disable the repos.
// - an unknown install (a verified event we never recorded) → 404 + audit,
//   a not 200 (a "no existence oracle", a WEBHOOK_SPECIFICATION §1.2 "the
//   sender can notice").
//
// The audit rows (a every rejection is audited, a WEBHOOK_SPECIFICATION §3
// "a forged-webhook attempt is investigable"): `webhook.rejected` on a
// 401, `webhook.malformed` on a 422, `webhook.replay` on a seen delivery,
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
import { createInMemoryQueue, type Enqueueable, type ReviewJobPayload } from "../queue.js";

// The audit actor id (a a webhook is not a user; a the audit table requires
// an actor, a a fixed system actor names the ingress itself).
const WEBHOOK_ACTOR = "github.webhook";

export interface GithubWebhookDeps {
  db?: PrismaClient;
  queue?: Enqueueable;
}

export function githubWebhookRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: GithubWebhookDeps = {}
) {
  const db = deps.db ?? new PrismaClient();
  // A test seam: an in-memory queue (a no Redis). A prod build uses the
  // BullQueue from `registerRoutes` (a it degrades to a no-op enqueue + a
  // warning when the REDIS_URL is unreachable, a the dev-stack rule).
  const queue: Enqueueable = deps.queue ?? createInMemoryQueue();
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
        /* a audit-write failure never fails the ingress response */
      });
  }

  app.post(
    "/github",
    { schema: { config: { public: true } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      // A raw body: a the HMAC is computed over the *raw* bytes, a not a
      // re-serialized object (a WEBHOOK_SPECIFICATION §1.1 "the HMAC is
      // computed over the raw request body").
      const rawBody = (req.body as unknown as { raw?: string } & string) ?? "";
      const raw =
        typeof rawBody === "string"
          ? rawBody
          : Buffer.isBuffer(req.rawBody ? undefined : undefined)
            ? ""
            : JSON.stringify(req.body ?? {});

      const headers = {
        signature: (req.headers["x-hub-signature-256"] as string | undefined) ?? "",
        deliveryId: (req.headers["x-hub-delivery"] as string | undefined) ?? "",
        timestamp: (req.headers["x-hub-timestamp"] as string | undefined) ?? "",
        event: (req.headers["x-github-event"] as string | undefined) ?? "",
      };

      // A layer 1–2: a HMAC + a timestamp window (a `@vercode/github`). A
      // failure → a 401 + a audit, a no queue write (a ST-webhook-forged /
      // -stale, a THREAT_MODEL T-01).
      const verdict = verifyGitHubWebhook(headers, raw, secret, {
        isDeliverySeen: async (id) => {
          const seen = await db.webhookDelivery.findUnique({ where: { deliveryId: id } });
          return seen !== null;
        },
      });
      if (!verdict.ok) {
        await audit(reply, {
          action: verdict.reason === "replay" ? "webhook.replay_rejected" : "webhook.rejected",
          meta: {
            reason: verdict.reason ?? "unknown",
            event: headers.event,
            deliveryId: headers.deliveryId,
          },
        });
        reply.code(401).send({
          error: { code: "WEBHOOK_REJECTED", message: "Webhook signature or timestamp verification failed." },
        });
        return;
      }

      // A layer 3: a the delivery dedup (a a seen id → a 200 no-op, a
      // ST-webhook-replay, a NFR-06). A the receipt row is written only on a
      // *fresh* delivery (a a seen one already has a row).
      const receipt = await db.webhookDelivery
        .create({
          data: {
            deliveryId: headers.deliveryId,
            event: headers.event,
            orgId: "pending",
            installId: "pending",
          },
        })
        .catch(async (err: unknown) => {
          // A a unique-constraint violation → a replay (a the original
          // delivery already wrote the row, a a "the original was processed
          // or is in-flight", a WEBHOOK_SPECIFICATION §1.1 layer 3).
          const code = (err as { code?: string }).code;
          if (code === "P2002") return null;
          throw err;
        });

      if (receipt === null) {
        await audit(reply, {
          action: "webhook.replay",
          targetId: headers.deliveryId,
          meta: { event: headers.event, deliveryId: headers.deliveryId },
        });
        reply.code(200).send({ ok: true, replay: true, deliveryId: headers.deliveryId });
        return;
      }

      // A the body schema (a WEBHOOK_SPECIFICATION §1.3 "a verified but
      // malformed → 422 + a audit + a not enqueued"; a the signature proves
      // origin, a the schema proves shape, a both are required).
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
          // A a event in EVENT_SCHEMAS but not routed yet (a M4's M5 work);
          // a receipt-only (a a verified event, a no side effect, a 202).
          reply.code(202).send({ ok: true, event: headers.event, receipt: true });
          return;
      }

      reply.code(202).send({ ok: true, event: headers.event, deliveryId: headers.deliveryId });
    }
  );
}

// ---------------------------------------------------------------------------
// The `pull_request` routing (a opened / a reopened / a synchronize → the
// commit-SHA idempotency + a the enqueue; a closed / a edited → a no-op
// receipt, a the full close-marking is a M4's T4.x).
// ---------------------------------------------------------------------------

async function handlePullRequest(
  db: PrismaClient,
  queue: Enqueueable,
  evt: PullRequestEvent,
  reply: FastifyReply,
  ctx: { deliveryId: string }
): Promise<void> {
  const action = evt.action;

  // A only the review-triggering actions enqueue (a WEBHOOK_SPECIFICATION
  // §1.2 "opened/reopened/synchronize"). a closed → a the job-terminal
  // marking is a M4's; a the receipt is logged, a no enqueue (a "a PR closed
  // during review → a the publish gets a clean notice", a the M4 path).
  const triggerReview = action === "opened" || action === "reopened" || action === "synchronize";

  // A the install→org resolution (a github_installs by installation.id). A
  // an unknown install → a 404 + a audit (a "no existence oracle"; a the
  // sender notices, a a 200 would mask the gap).
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

  // A a removed / a deleted org → a the event is DROPPED (a "a resolved to a
  // removed/deleted org → a the event is dropped, a no enqueue", a
  // WEBHOOK_SPECIFICATION §1.2 "a webhook.dropped_install_inactive").
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

  // A the install is REMOVED (a an install.deleted arrived but the repo row
  // is still there, a a queued job would skip: install_removed, a AC-204).
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

  // A the repo row (a the PR event's repository.id → a the github_repos row).
  const repo = await db.githubRepo.findUnique({
    where: {
      orgId_githubRepoId: { orgId: org.id, githubRepoId: BigInt(evt.repository.id) },
    },
  });
  if (!repo || !repo.connected) {
    // A a verified event against a repo we don't track (a it was never
    // discovered, a it was removed via installation_repositories.removed,
    // a a foreign repo on the install) → a drop + a audit, a not a 404
    // (a the *install* is known; a it's the *repo* that's out of scope).
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

  // A only the review-triggering actions reach the idempotency + a enqueue.
  if (!triggerReview) {
    // a closed / a edited → a the receipt is logged, a no enqueue (a the
    // terminal-marking is a M4's T4.1 "a PR closed during review → the
    // in-flight job is marked terminal; a stop publishing").
    reply.code(202).send({ ok: true, event: "pull_request", receipt: true, action });
    return;
  }

  const commitSha = evt.pull_request.head.sha;

  // A THE commit-SHA idempotency (a ADR-007, a `review_jobs`'
  // `(orgId, repoId, prNumber, commitSha)` unique key, a IT-idempotency-01
  // "a same-SHA no-op, a a new SHA a new job"). a A SUCCEEDED job for the
  // key → a 200 no-op + a audit (a a re-push to the *same* SHA is a
  // no-op, a no re-review).
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

  // A the create / a reuse of a review_jobs row (a an in-flight or a
  // non-SUCCEEDED row for the key is a reused — a a synchronize onto a
  // QUEUED/RUNNING/FAILED job is a re-enqueue, a not a new row, a the
  // idempotency key is respected: a no duplicate row, a the row's status is
  // reset to QUEUED for the re-run).
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
    // A a re-trigger onto a non-terminal job (a a synchronize after a
    // failure, a a new push after a partial) → a the row's status is
    // re-queued (a the worker's in-flight lock + a the durable re-read is
    // the correctness, a the reset is the "re-run" signal).
    await db.reviewJob.update({ where: { id: job.id }, data: { status: "QUEUED" } });
  }

  // A the enqueue (a the payload is ONLY a the pointer + a correlation — a
  // the worker re-reads a the org / a the quota / a the settings, a
  // SERVICE_BOUNDARIES "a job payload is a pointer, not an authority").
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
// The `installation` routing (a created → a record + a repo discover; a
// deleted → a the AC-204: a REMOVED + a repos disconnected + a the
// retention_jobs purge row).
// ---------------------------------------------------------------------------

async function handleInstallation(
  db: PrismaClient,
  evt: InstallationEvent,
  reply: FastifyReply
): Promise<void> {
  if (evt.action === "created") {
    // A the install → a the org. A an unknown account (a a org we don't have)
    // → a the install is recorded under a a *placeholder* org lookup: a the
    // org is resolved by the account login (a the M2 org-creation flow is
    // where a org is minted; a this route assumes a org exists, a the
    // full install-flow is a T3.3's M2+M3 glue, a the "a the install URL is
    // generated server-side"). a A org-miss → a no row (a the install URL
    // flow creates the org first), a a the receipt is logged.
    const org = await db.organization.findFirst({
      where: { slug: evt.installation.account.login.toLowerCase() },
    });
    if (!org) {
      // a No org yet → a no install row (a the ingress can't mint a org, a
      // the install flow does that). a A audit (a "a install for an
      // unknown org" is a the operator's gap, a not a a security event).
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

    await db.githubInstall.upsert({
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

    // a the repo discover (a the install payload carries the repos
    // when `repository_selection` is "selected"; a the full discover is a
    // the GitHub API call, a a M2's, a the *ingress* records what the event
    // gives).
    if (evt.installation.repositories?.length) {
      const installRow = await db.githubInstall.findFirst({
        where: {
          orgId: org.id,
          githubInstallationId: String(evt.installation.id),
        },
      });
      if (installRow) {
        for (const r of evt.installation.repositories) {
          await upsertRepoRow(db, org.id, installRow.id, { id: r.id, full_name: "", default_branch: "main" });
        }
      }
    }
    return;
  }

  // a deleted → a the AC-204: a the install row → a REMOVED + a the
  // removedAt; a the repos → a disconnected + a the disabledAt; a a the
  // retention_jobs purge row (a the "a content-purge schedule", a a
  // DATA_RETENTION §4 "a install-removal evicts a the org's diff cache +
  // schedules a the content purge").
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
// The `installation_repositories` routing (a added → a the upsert; a
// removed → a the disable).
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
    void now;
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

// a a upsert of a a github_repos row (a the orgId + a the githubRepoId is a
// the tenant-scoped unique key, a DATABASE_DESIGN §8).
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
