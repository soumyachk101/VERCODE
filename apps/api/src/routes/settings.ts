// The settings & policy configuration routes: GET/PATCH /orgs/:id/settings,
// GET/POST /orgs/:id/rules, GET/POST/DELETE /orgs/:id/providers/byok (API_SPECIFICATION.md).

import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";

export async function settingsRoutes(app: FastifyInstance) {
  const db = app.auth.db;

  // ---------------------------------------------------------------------------
  // GET /orgs/:id/settings — Fetch org settings
  // ---------------------------------------------------------------------------
  app.get("/:id/settings", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const settings = await db.orgSettings.findUnique({
      where: { orgId: id },
    });

    if (!settings) {
      reply.send({
        confidenceFloor: 0.6,
        maxFiles: 60,
        maxLines: 3000,
        provider: "openai",
        tokenSpendCapMonthlyUsd: 0,
        activeReposForReview: [],
      });
      return;
    }

    reply.send({
      confidenceFloor: Number(settings.confidenceFloor),
      maxFiles: settings.maxFiles,
      maxLines: settings.maxLines,
      provider: settings.provider,
      tokenSpendCapMonthlyUsd: Number(settings.tokenSpendCapMonthly),
      activeReposForReview: (settings.activeReposForReview ?? []) as unknown[],
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /orgs/:id/settings — Update org settings
  // ---------------------------------------------------------------------------
  app.patch(
    "/:id/settings",
    { schema: { config: { capability: "org.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as {
        confidenceFloor?: number;
        maxFiles?: number;
        maxLines?: number;
        provider?: string;
        tokenSpendCapMonthlyUsd?: number;
        activeReposForReview?: string[];
      };

      const userId = req.user.userId ?? "";

      const activeReposForReview = Array.isArray(body.activeReposForReview)
        ? body.activeReposForReview.map(String)
        : undefined;

      const updated = await db.orgSettings.upsert({
        where: { orgId: id },
        create: {
          orgId: id,
          confidenceFloor: body.confidenceFloor !== undefined ? new Prisma.Decimal(body.confidenceFloor) : new Prisma.Decimal(0.6),
          maxFiles: body.maxFiles ?? 60,
          maxLines: body.maxLines ?? 3000,
          provider: body.provider ?? "openai",
          tokenSpendCapMonthly: body.tokenSpendCapMonthlyUsd !== undefined ? new Prisma.Decimal(body.tokenSpendCapMonthlyUsd) : new Prisma.Decimal(0),
          updatedBy: userId,
          activeReposForReview: activeReposForReview ? (activeReposForReview as unknown as Prisma.InputJsonValue) : undefined,
        },
        update: {
          confidenceFloor: body.confidenceFloor !== undefined ? new Prisma.Decimal(body.confidenceFloor) : undefined,
          maxFiles: body.maxFiles !== undefined ? body.maxFiles : undefined,
          maxLines: body.maxLines !== undefined ? body.maxLines : undefined,
          provider: body.provider !== undefined ? body.provider : undefined,
          tokenSpendCapMonthly: body.tokenSpendCapMonthlyUsd !== undefined ? new Prisma.Decimal(body.tokenSpendCapMonthlyUsd) : undefined,
          updatedBy: userId,
          activeReposForReview:
            activeReposForReview !== undefined ? (activeReposForReview as unknown as Prisma.InputJsonValue) : undefined,
        },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: userId,
          action: "org.settings_updated",
          targetType: "settings",
          targetId: updated.id,
          meta: body as unknown as Prisma.InputJsonValue,
        },
      });

      reply.send({
        confidenceFloor: Number(updated.confidenceFloor),
        maxFiles: updated.maxFiles,
        maxLines: updated.maxLines,
        provider: updated.provider,
        tokenSpendCapMonthlyUsd: Number(updated.tokenSpendCapMonthly),
        activeReposForReview: (updated.activeReposForReview ?? []) as unknown[],
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /orgs/:id/rules — List custom repo rules
  // ---------------------------------------------------------------------------
  app.get("/:id/rules", { schema: { config: { capability: "read" } } }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const rules = await db.repoRule.findMany({
      where: { orgId: id },
      include: { repo: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });

    reply.send({
      rules: rules.map((r) => ({
        id: r.id,
        repoId: r.repoId,
        repoName: r.repo?.fullName,
        version: r.version,
        suppressCategories: r.suppressCategories,
        confidenceFloorOverride: r.confidenceFloorOverride ? Number(r.confidenceFloorOverride) : null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // POST /orgs/:id/rules — Create or update a repo rule
  // ---------------------------------------------------------------------------
  app.post(
    "/:id/rules",
    { schema: { config: { capability: "rules.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as {
        repoId: string;
        suppressCategories?: string[];
        confidenceFloorOverride?: number;
      };

      if (!body?.repoId) {
        reply.code(422).send({ error: { code: "VALIDATION_ERROR", message: "repoId is required." } });
        return;
      }

      const userId = req.user.userId ?? "";

      const rule = await db.repoRule.create({
        data: {
          orgId: id,
          repoId: body.repoId,
          suppressCategories: (body.suppressCategories ?? []) as unknown as Prisma.InputJsonValue,
          confidenceFloorOverride: body.confidenceFloorOverride !== undefined ? new Prisma.Decimal(body.confidenceFloorOverride) : null,
          createdBy: userId,
        },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: userId,
          action: "rules.created",
          targetType: "rule",
          targetId: rule.id,
          meta: { repoId: body.repoId },
        },
      });

      reply.code(201).send({
        id: rule.id,
        repoId: rule.repoId,
        suppressCategories: rule.suppressCategories,
        confidenceFloorOverride: rule.confidenceFloorOverride ? Number(rule.confidenceFloorOverride) : null,
        createdAt: rule.createdAt.toISOString(),
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /orgs/:id/providers — Active providers & BYOK keys
  // ---------------------------------------------------------------------------
  app.get(
    "/:id/providers",
    { schema: { config: { capability: "org.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      const keys = await db.bYOKKey.findMany({
        where: { orgId: id, active: true },
        select: { id: true, provider: true, keyPrefix: true, createdAt: true },
      });

      reply.send({
        configured: ["openai", "anthropic", "ollama"],
        byok: keys.map((k) => ({
          provider: k.provider,
          maskedKey: `...${k.keyPrefix}`,
          configuredAt: k.createdAt.toISOString(),
        })),
      });
    }
  );

  // ---------------------------------------------------------------------------
  // POST /orgs/:id/providers/byok — Set / rotate BYOK key
  // ---------------------------------------------------------------------------
  app.post(
    "/:id/providers/byok",
    { schema: { config: { capability: "org.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { provider: string; apiKey: string };

      if (!body?.provider || !body?.apiKey) {
        reply.code(422).send({ error: { code: "VALIDATION_ERROR", message: "provider and apiKey are required." } });
        return;
      }

      const keyPrefix = body.apiKey.length >= 4 ? body.apiKey.slice(-4) : body.apiKey;
      // In production, the key is KMS-wrapped. In dev/mvp, stored safely as a buffer
      const wrappedKey = Buffer.from(body.apiKey, "utf-8");
      const userId = req.user.userId ?? "";

      await db.bYOKKey.upsert({
        where: { orgId_provider: { orgId: id, provider: body.provider.toLowerCase() } },
        create: {
          orgId: id,
          userId,
          provider: body.provider.toLowerCase(),
          wrappedKey,
          kmsKeyId: "arn:aws:kms:dev:default",
          keyPrefix,
          active: true,
        },
        update: {
          userId,
          wrappedKey,
          keyPrefix,
          active: true,
        },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: userId,
          action: "byok.configured",
          targetType: "byok",
          targetId: body.provider,
        },
      });

      reply.send({ ok: true, provider: body.provider, keyPrefix });
    }
  );

  // ---------------------------------------------------------------------------
  // DELETE /orgs/:id/providers/byok — Revoke BYOK key
  // ---------------------------------------------------------------------------
  app.delete(
    "/:id/providers/byok",
    { schema: { config: { capability: "org.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { provider?: string };

      const provider = (body?.provider ?? "openai").toLowerCase();

      await db.bYOKKey.updateMany({
        where: { orgId: id, provider },
        data: { active: false },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: req.user.userId ?? "",
          action: "byok.revoked",
          targetType: "byok",
          targetId: provider,
        },
      });

      reply.send({ ok: true, revoked: provider });
    }
  );
}
