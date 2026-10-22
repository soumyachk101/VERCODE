// The tenant-scoped repository layer (TENANT_ISOLATION.md §2 "the
// repository: every method takes orgId first and always includes it in the
// where clause; a missing orgId is a 500, never 'return everything'").
//
// This is M2's T2.2. The `orgId` first-arg + always-in-the-where is the
// database-level enforcement of FR-105 (tenant scoping) + NFR-07 (zero
// cross-tenant rows). A repository method that returns rows without an
// org_id filter does not exist in this surface.

import { Prisma, PrismaClient, Role } from "@prisma/client";

export type DbClient = PrismaClient;
// The DB role enum (uppercase) is the Prisma `Role`; the contracts role
// (lowercase) is the API shape. The repository exposes the Prisma Role.
export { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Tenancy helpers
// ---------------------------------------------------------------------------

/**
 * A repository that requires an orgId. A method that forgets it is a
 * programming error (500), never a "return everything" default
 * (TENANT_ISOLATION.md §2 "a missing orgId is a programming error").
 */
export interface TenantScoped {
  readonly orgId: string;
}

// ---------------------------------------------------------------------------
// The Org repository (the tenant root)
// ---------------------------------------------------------------------------

export class OrgRepo {
  constructor(private readonly db: DbClient) {}

  create(input: { slug: string; name: string; ownerId: string; ownerRole?: Role }) {
    // Exactly one owner (the partial-unique index backstop, SCHEMA_REFERENCE.md).
    // The creator becomes the owner.
    return this.db.organization.create({
      data: {
        slug: input.slug,
        name: input.name,
        memberships: {
          create: {
            userId: input.ownerId,
            role: input.ownerRole ?? "OWNER",
          },
        },
      },
      include: { memberships: true },
    });
  }

  /** A tenant read: scoped by orgId. A 404 (not 403) for a missing org. */
  getById(orgId: string) {
    return this.db.organization.findFirst({
      where: { id: orgId, status: { not: "DELETED" } },
    });
  }

  listForUser(userId: string) {
    return this.db.organization.findMany({
      where: {
        memberships: { some: { userId } },
        status: { not: "DELETED" },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// The Membership repository (the RBAC resolution)
// ---------------------------------------------------------------------------

export class MembershipRepo {
  constructor(private readonly db: DbClient) {}

  /** The user's membership in an org (the capability resolution, AUTHORIZATION §4). */
  get(orgId: string, userId: string) {
    return this.db.membership.findFirst({
      where: { orgId, userId },
    });
  }

  /** The org's members (the Team page, PAGE_SPECIFICATIONS §7). */
  list(orgId: string) {
    return this.db.membership.findMany({
      where: { orgId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  setRole(orgId: string, userId: string, role: Role) {
    return this.db.membership.updateMany({
      where: { orgId, userId },
      data: { role },
    });
  }

  remove(orgId: string, userId: string) {
    return this.db.membership.deleteMany({ where: { orgId, userId } });
  }
}

// ---------------------------------------------------------------------------
// The ReviewJob repository (the idempotency key, ADR-007)
// ---------------------------------------------------------------------------

export class ReviewJobRepo {
  constructor(private readonly db: DbClient) {}

  /** The idempotency check (REVIEW_ENGINE_SPEC §2 stage [1]): was this commit reviewed? */
  findByIdempotencyKey(orgId: string, repoId: string, prNumber: number, commitSha: string) {
    return this.db.reviewJob.findUnique({
      where: {
        orgId_repoId_prNumber_commitSha: {
          orgId,
          repoId,
          prNumber,
          commitSha,
        },
      },
    });
  }

  create(input: {
    orgId: string;
    repoId: string;
    prNumber: number;
    commitSha: string;
    status?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED" | "PARTIAL";
    skipReason?: string;
  }) {
    return this.db.reviewJob.create({
      data: {
        orgId: input.orgId,
        repoId: input.repoId,
        prNumber: input.prNumber,
        commitSha: input.commitSha,
        status: input.status ?? "QUEUED",
        skipReason: input.skipReason,
      },
    });
  }

  list(orgId: string, opts?: { status?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED" | "PARTIAL"; limit?: number }) {
    return this.db.reviewJob.findMany({
      where: { orgId, ...(opts?.status ? { status: opts.status } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 50,
    });
  }
}

// ---------------------------------------------------------------------------
// The UsageEvent repository (the append-only quota source, NFR-27/28)
// ---------------------------------------------------------------------------

export class UsageEventRepo {
  constructor(private readonly db: DbClient) {}

  /**
   * The monthly aggregate for the pre-flight quota gate
   * (REVIEW_ENGINE_SPEC §2 stage [0], USAGE_QUOTAS §4 "a checkQuota reads
   * planQuota + the usage_events monthly aggregate").
   */
  monthlyTotals(orgId: string, month: string) {
    return this.db.usageEvent.aggregate({
      where: { orgId, month },
      _sum: {
        reviewCount: true,
        inputTokens: true,
        outputTokens: true,
        estUsdCost: true,
      },
    });
  }

  record(input: {
    orgId: string;
    jobId?: string;
    month: string;
    inputTokens: number;
    outputTokens: number;
    estUsdCost: number;
    model?: string;
  }) {
    return this.db.usageEvent.create({
      data: {
        orgId: input.orgId,
        jobId: input.jobId,
        month: input.month,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        estUsdCost: input.estUsdCost,
        model: input.model,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// The AuditEvent repository (the append-only 180 d floor, NFR-27)
// ---------------------------------------------------------------------------

export class AuditEventRepo {
  constructor(private readonly db: DbClient) {}

  record(input: {
    orgId?: string;
    actorId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    sourceIp?: string;
    meta?: unknown;
  }) {
    return this.db.auditEvent.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        sourceIp: input.sourceIp,
        meta: input.meta ?? Prisma.JsonNull,
      },
    });
  }

  list(orgId: string, opts?: { action?: string; limit?: number }) {
    return this.db.auditEvent.findMany({
      where: { orgId, ...(opts?.action ? { action: opts.action } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 50,
    });
  }
}

// A repository bundle — the api/worker take one instance.
export class Repos {
  readonly orgs: OrgRepo;
  readonly memberships: MembershipRepo;
  readonly reviewJobs: ReviewJobRepo;
  readonly usage: UsageEventRepo;
  readonly audit: AuditEventRepo;

  constructor(db: DbClient) {
    this.orgs = new OrgRepo(db);
    this.memberships = new MembershipRepo(db);
    this.reviewJobs = new ReviewJobRepo(db);
    this.usage = new UsageEventRepo(db);
    this.audit = new AuditEventRepo(db);
  }
}

export function createRepos(db: DbClient): Repos {
  return new Repos(db);
}
