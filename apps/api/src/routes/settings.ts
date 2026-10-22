// The settings & configuration routes: /orgs/:id/settings, /orgs/:id/rules,
// /orgs/:id/providers, /orgs/:id/providers/byok (API_SPECIFICATION.md "Configuration").
// Tenant-scoped and capability-gated.

import type { FastifyInstance } from "fastify";
import {
  UpdateOrgSettingsRequestSchema,
  SetBYOKKeyRequestSchema,
  type UpdateOrgSettingsRequest,
  type SetBYOKKeyRequest,
} from "@vercode/contracts";
import { z } from "zod";

const CreateRuleSchema = z.object({
  repoId: z.string().min(1),
  suppressCategories: z.array(z.string()).default([]),
  confidenceFloorOverride: z.number().min(0).max(1).optional(),
  perLanguageToggles: z.record(z.boolean()).optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  // GET /:id/settings — Retrieve org settings
  app.get(
    "/:id/settings",
    { schema: { config: { capability: "read" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = app.auth.db;

      const settings = await db.orgSettings.findUnique({
        where: { orgId: id },
      });

      if (!settings) {
        // Return default settings
        reply.send({
          settings: {
            orgId: id,
            confidenceFloor: 0.6,
            maxFiles: 60,
            maxLines: 3000,
            provider: "openai",
            tokenSpendCapMonthly: 0,
            updatedAt: new Date().toISOString(),
          },
        });
        return;
      }

      reply.send({
        settings: {
          orgId: settings.orgId,
          confidenceFloor: Number(settings.confidenceFloor),
          maxFiles: settings.maxFiles,
          maxLines: settings.maxLines,
          provider: settings.provider,
          tokenSpendCapMonthly: Number(settings.tokenSpendCapMonthly),
          updatedAt: settings.updatedAt.toISOString(),
        },
      });
    }
  );

  // PATCH /:id/settings — Update org settings (admin+)
  app.patch(
    "/:id/settings",
    {
      schema: {
        body: UpdateOrgSettingsRequestSchema,
        config: { capability: "settings.manage" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as UpdateOrgSettingsRequest;
      const db = app.auth.db;
      const userId = req.user.userId ?? "system";

      const updated = await db.orgSettings.upsert({
        where: { orgId: id },
        create: {
          orgId: id,
          confidenceFloor: body.confidenceFloor ?? 0.6,
          maxFiles: body.maxFiles ?? 60,
          maxLines: body.maxLines ?? 3000,
          provider: body.provider ?? "openai",
          tokenSpendCapMonthly: body.tokenSpendCapMonthlyUsd ?? 0,
          updatedBy: userId,
        },
        update: {
          ...(body.confidenceFloor !== undefined && { confidenceFloor: body.confidenceFloor }),
          ...(body.maxFiles !== undefined && { maxFiles: body.maxFiles }),
          ...(body.maxLines !== undefined && { maxLines: body.maxLines }),
          ...(body.provider !== undefined && { provider: body.provider }),
          ...(body.tokenSpendCapMonthlyUsd !== undefined && {
            tokenSpendCapMonthly: body.tokenSpendCapMonthlyUsd,
          }),
          updatedBy: userId,
        },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: userId,
          action: "org.settings_updated",
          targetType: "org_settings",
          targetId: id,
          meta: body as Record<string, unknown>,
        },
      });

      reply.send({
        settings: {
          orgId: updated.orgId,
          confidenceFloor: Number(updated.confidenceFloor),
          maxFiles: updated.maxFiles,
          maxLines: updated.maxLines,
          provider: updated.provider,
          tokenSpendCapMonthly: Number(updated.tokenSpendCapMonthly),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    }
  );

  // GET /:id/rules — List custom rules for the organization
  app.get(
    "/:id/rules",
    { schema: { config: { capability: "read" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = app.auth.db;

      const rules = await db.repoRule.findMany({
        where: { orgId: id },
        include: { repo: { select: { fullName: true } } },
        orderBy: { createdAt: "desc" },
      });

      reply.send({
        rules: rules.map((r) => ({
          id: r.id,
          orgId: r.orgId,
          repoId: r.repoId,
          repoName: r.repo?.fullName,
          version: r.version,
          suppressCategories: r.suppressCategories,
          confidenceFloorOverride: r.confidenceFloorOverride ? Number(r.confidenceFloorOverride) : null,
          perLanguageToggles: r.perLanguageToggles,
          createdBy: r.createdBy,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }
  );

  // POST /:id/rules — Create or update versioned rule (developer+)
  app.post(
    "/:id/rules",
    {
      schema: {
        body: CreateRuleSchema,
        config: { capability: "settings.manage" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof CreateRuleSchema>;
      const db = app.auth.db;
      const userId = req.user.userId ?? "system";

      // Verify repo belongs to org
      const repo = await db.githubRepo.findFirst({
        where: { id: body.repoId, orgId: id },
      });
      if (!repo) {
        reply.code(404).send({ error: { code: "NOT_FOUND", message: "Repository not found in org." } });
        return;
      }

      // Check current latest version for this repo
      const latest = await db.repoRule.findFirst({
        where: { orgId: id, repoId: body.repoId },
        orderBy: { version: "desc" },
      });
      const newVersion = (latest?.version ?? 0) + 1;

      const rule = await db.repoRule.create({
        data: {
          orgId: id,
          repoId: body.repoId,
          version: newVersion,
          suppressCategories: body.suppressCategories,
          confidenceFloorOverride: body.confidenceFloorOverride ?? null,
          perLanguageToggles: body.perLanguageToggles ?? null,
          createdBy: userId,
        },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: userId,
          action: "rule.created",
          targetType: "repo_rule",
          targetId: rule.id,
          meta: { repoId: body.repoId, version: newVersion },
        },
      });

      reply.code(201).send({
        id: rule.id,
        orgId: rule.orgId,
        repoId: rule.repoId,
        version: rule.version,
        suppressCategories: rule.suppressCategories,
        confidenceFloorOverride: rule.confidenceFloorOverride ? Number(rule.confidenceFloorOverride) : null,
        createdAt: rule.createdAt.toISOString(),
      });
    }
  );

  // GET /:id/providers — Provider & routing configuration (admin+)
  app.get(
    "/:id/providers",
    { schema: { config: { capability: "settings.manage" } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = app.auth.db;

      const byokKeys = await db.bYOKKey.findMany({
        where: { orgId: id, active: true },
        select: {
          id: true,
          provider: true,
          keyPrefix: true,
          createdAt: true,
        },
      });

      const routes = await db.modelRoute.findMany({
        where: { orgId: id },
        orderBy: { version: "desc" },
      });

      reply.send({
        byok: byokKeys.map((k) => ({
          id: k.id,
          provider: k.provider,
          maskedKey: `${k.keyPrefix}••••••••`,
          createdAt: k.createdAt.toISOString(),
        })),
        routes: routes.map((r) => ({
          id: r.id,
          task: r.task,
          provider: r.provider,
          model: r.model,
          maxTokens: r.maxTokens,
          version: r.version,
        })),
      });
    }
  );

  // POST /:id/providers/byok — Set / rotate BYOK key (admin+)
  app.post(
    "/:id/providers/byok",
    {
      schema: {
        body: SetBYOKKeyRequestSchema,
        config: { capability: "settings.manage" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { provider, apiKey } = req.body as SetBYOKKeyRequest;
      const db = app.auth.db;
      const userId = req.user.userId ?? "system";

      const keyPrefix = apiKey.slice(0, 4);
      // Wrapped key in bytes (in dev/test, simulated wrapping with buffer)
      const wrappedKey = Buffer.from(`kms:wrapped:${apiKey}`);

      const record = await db.bYOKKey.upsert({
        where: { orgId_provider: { orgId: id, provider } },
        create: {
          orgId: id,
          userId,
          provider,
          wrappedKey,
          kmsKeyId: "alias/vercode-byok-default",
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
          action: "byok.key_updated",
          targetType: "byok_key",
          targetId: record.id,
          meta: { provider, keyPrefix },
        },
      });

      reply.send({
        id: record.id,
        provider: record.provider,
        maskedKey: `${keyPrefix}••••••••`,
        updatedAt: record.createdAt.toISOString(),
      });
    }
  );

  // DELETE /:id/providers/byok — Revoke BYOK key (admin+)
  app.delete(
    "/:id/providers/byok",
    {
      schema: {
        body: z.object({ provider: z.enum(["openai", "anthropic"]) }),
        config: { capability: "settings.manage" },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { provider } = req.body as { provider: string };
      const db = app.auth.db;
      const userId = req.user.userId ?? "system";

      await db.bYOKKey.deleteMany({
        where: { orgId: id, provider },
      });

      await db.auditEvent.create({
        data: {
          orgId: id,
          actorId: userId,
          action: "byok.key_revoked",
          targetType: "byok_key",
          targetId: id,
          meta: { provider },
        },
      });

      reply.send({ ok: true, provider, revoked: true });
    }
  );
}
