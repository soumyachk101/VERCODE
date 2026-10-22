# VERCODE — Schema Reference

The Prisma schema (`packages/database/prisma/schema.prisma`), which is the *implementation* of `DATABASE_DESIGN.md` / `ERD.md`. This file is the canonical reference for field names; the Prisma file must stay consistent with it.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------------------------------------------------------------- identity

model User {
  id            String    @id @default(cuid())
  email         String    @unique @map("email")
  emailVerified Boolean   @default(false) @map("email_verified")
  passwordHash  String    @map("password_hash")
  name          String?
  createdAt     DateTime  @default(now()) @map("created_at")
  memberships   Membership[]
  sessions      Session[]
  auditEvents   AuditEvent[]
  findByOk      BYOKKey[]
  @@map("users")
}

model Session {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique @map("token_hash")
  sourceIp  String?  @map("source_ip")
  userAgent String?  @map("user_agent")
  expiresAt DateTime @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime @default(now()) @map("created_at")
  @@index([userId])
  @@map("sessions")
}

model Organization {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  plan      Plan     @default(FREE)
  status    OrgStatus @default(ACTIVE)
  createdAt DateTime @default(now()) @map("created_at")

  memberships  Membership[]
  invitations  Invitation[]
  installs     GithubInstall[]
  settings     OrgSettings[]
  byokKeys     BYOKKey[]
  billing      OrgBilling?
  usage        UsageEvent[]
  audit        AuditEvent[]
  retention    RetentionJob[]
  modelRoutes  ModelRoute[]
  @@map("organizations")
}

enum Plan {
  FREE
  DEVELOPER
  TEAM
  ENTERPRISE
}

enum OrgStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

model Membership {
  id        String   @id @default(cuid())
  orgId     String   @map("org_id")
  userId    String   @map("user_id")
  role      Role
  createdAt DateTime @default(now()) @map("created_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([orgId, userId])
  @@index([orgId, role])
  @@map("memberships")
}

enum Role {
  OWNER
  ADMIN
  DEVELOPER
  VIEWER
}

model Invitation {
  id        String   @id @default(cuid())
  orgId     String   @map("org_id")
  email     String
  role      Role
  tokenHash String   @unique @map("token_hash")
  status    InvStatus @default(PENDING)
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, email]) // one pending invite per email per org
  @@map("invitations")
}

enum InvStatus {
  PENDING
  ACCEPTED
  REVOKED
  EXPIRED
}

// ------------------------------------------------------------- github

model GithubInstall {
  id                 String   @id @default(cuid())
  orgId              String   @map("org_id")
  githubInstallationId String @map("github_installation_id")
  accountType        String   @map("account_type")
  accountLogin       String   @map("account_login")
  status             InstallStatus @default(ACTIVE)
  repositorySelection String  @default("all") @map("repository_selection")
  createdAt          DateTime @default(now()) @map("created_at")
  removedAt          DateTime? @map("removed_at")

  org   Organization   @relation(fields: [orgId], references: [id], onDelete: Cascade)
  repos GithubRepo[]
  deliveries WebhookDelivery[]

  @@unique([orgId, githubInstallationId])
  @@map("github_installs")
}

enum InstallStatus {
  ACTIVE
  REMOVED
}

model GithubRepo {
  id            String    @id @default(cuid())
  orgId         String    @map("org_id")
  installId     String    @map("install_id")
  githubRepoId  BigInt    @map("github_repo_id")
  fullName      String    @map("full_name")
  defaultBranch String    @map("default_branch")
  connected     Boolean   @default(true)
  disabledAt    DateTime? @map("disabled_at")
  createdAt     DateTime  @default(now()) @map("created_at")

  org        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  install    GithubInstall @relation(fields: [installId], references: [id], onDelete: Cascade)
  rules      RepoRule[]
  jobs       ReviewJob[]

  @@unique([orgId, githubRepoId])
  @@map("github_repos")
}

model WebhookDelivery {
  id           String   @id @default(cuid())
  installId    String   @map("install_id")
  deliveryId   String   @unique @map("delivery_id") // X-Hub-Delivery
  event        String
  orgId        String   @map("org_id")
  receivedAt   DateTime @default(now()) @map("received_at")
  accepted     Boolean  @default(true)

  install GithubInstall @relation(fields: [installId], references: [id], onDelete: Cascade)
  @@index([orgId, receivedAt])
  @@map("webhook_deliveries")
}

// ---------------------------------------------------------------- reviews

model ReviewJob {
  id                     String   @id @default(cuid())
  orgId                  String   @map("org_id")
  repoId                 String   @map("repo_id")
  prNumber               Int      @map("pr_number")
  commitSha              String   @map("commit_sha")
  status                 JobStatus @default(QUEUED)
  skipReason             String?  @map("skip_reason")
  error                  String?
  model                  String?
  promptVersion          String?  @map("prompt_version")
  inputTokens            Int      @default(0) @map("input_tokens")
  outputTokens           Int      @default(0) @map("output_tokens")
  estUsdCost             Decimal  @default(0) @map("est_usd_cost") @db.Decimal(10, 6)
  publishedGithubReviewId String? @map("published_github_review_id")
  createdAt              DateTime @default(now()) @map("created_at")
  finishedAt             DateTime? @map("finished_at")

  repo     GithubRepo  @relation(fields: [repoId], references: [id], onDelete: Cascade)
  findings ReviewFinding[]
  usage    UsageEvent[]

  @@unique([orgId, repoId, prNumber, commitSha]) // THE idempotency key
  @@index([orgId, status, createdAt])
  @@map("review_jobs")
}

enum JobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  SKIPPED
  PARTIAL
}

model ReviewFinding {
  id           String   @id @default(cuid())
  jobId        String   @map("job_id")
  source       FindingSource
  file         String
  line         Int
  severity     Severity
  category     FindingCategory
  title        String
  description  String
  suggestedFix String?  @map("suggested_fix")
  confidence   Decimal  @db.Decimal(3, 2) // 0..1
  anchorStatus AnchorStatus @default(INLINE) @map("anchor_status")
  payload      Json
  createdAt    DateTime @default(now()) @map("created_at")

  job    ReviewJob     @relation(fields: [jobId], references: [id], onDelete: Cascade)
  actions FindingAction[]

  @@index([jobId])
  @@index([file, line, category])
  @@map("review_findings")
}

enum FindingSource {
  ESLINT
  SEMGREP
  AI_DEEP
  AI_SECURITY
  DETERMINISTIC_SUMMARY
}

enum Severity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum FindingCategory {
  LOGIC_BUG
  SECURITY
  PERFORMANCE
  RACE_CONDITION
  RESOURCE_LEAK
  API_CONTRACT
  DB_CONSISTENCY
  EDGE_CASE
  ASSUMPTION
}

enum AnchorStatus {
  INLINE
  ANCHOR_FAILED
  PR_BODY
}

model FindingAction {
  id         String      @id @default(cuid())
  findingId  String      @map("finding_id")
  orgId      String      @map("org_id")
  actorId    String?     @map("actor_id")
  actionType ActionType
  actedAt    DateTime    @default(now()) @map("acted_at")

  finding ReviewFinding @relation(fields: [findingId], references: [id], onDelete: Cascade)
  @@index([orgId, actedAt])
  @@map("finding_actions")
}

enum ActionType {
  ACCEPTED
  DISMISSED_REASONABLE
  DISMISSED_UNREASONABLE
  FIXED
  IGNORED
}

// ---------------------------------------------------------------- config

model OrgSettings {
  id             String   @id @default(cuid())
  orgId          String   @map("org_id")
  confidenceFloor Decimal @default(0.6) @map("confidence_floor") @db.Decimal(3, 2)
  maxFiles       Int      @default(60) @map("max_files")
  maxLines       Int      @default(3000) @map("max_lines")
  provider       String   @default("openai")
  tokenSpendCapMonthly Decimal @default(0) @map("token_spend_cap_monthly") @db.Decimal(12, 6)
  updatedBy      String   @map("updated_by")
  updatedAt      DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@unique([orgId])
  @@map("org_settings")
}

model RepoRule {
  id          String   @id @default(cuid())
  orgId       String   @map("org_id")
  repoId      String   @map("repo_id")
  version     Int      @default(1)
  suppressCategories Json // FindingCategory[]
  confidenceFloorOverride Decimal? @map("confidence_floor_override") @db.Decimal(3, 2)
  perLanguageToggles Json?
  createdBy   String   @map("created_by")
  createdAt   DateTime @default(now()) @map("created_at")

  repo GithubRepo @relation(fields: [repoId], references: [id], onDelete: Cascade)
  @@index([orgId, repoId, version])
  @@map("repo_rules")
}

model ModelRoute {
  id       String @id @default(cuid())
  orgId    String @map("org_id")
  task     String // "risk-triage"|"deep-review"|"security-review"|"summary"
  provider String
  model    String
  maxTokens Int   @map("max_tokens")
  version  Int
  updatedAt DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@unique([orgId, task, version])
  @@map("model_routes")
}

model BYOKKey {
  id        String   @id @default(cuid())
  orgId     String   @map("org_id")
  userId    String?  @map("user_id") // who set it
  provider  String
  // KMS-wrapped ciphertext of the provider API key. NEVER the raw key.
  wrappedKey Bytes  @map("wrapped_key")
  kmsKeyId  String  @map("kms_key_id")
  keyPrefix String  // last-4 for masked display
  active    Boolean @default(true)
  createdAt DateTime @default(now()) @map("created_at")

  org  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
  @@unique([orgId, provider])
  @@map("byok_keys")
}

// ---------------------------------------------------------------- usage / billing

model UsageEvent {
  id          String   @id @default(cuid())
  orgId       String   @map("org_id")
  jobId       String?  @map("job_id")
  month       String   // "YYYY-MM"
  reviewCount Int      @default(1) @map("review_count")
  inputTokens Int      @default(0) @map("input_tokens")
  outputTokens Int     @default(0) @map("output_tokens")
  estUsdCost  Decimal  @default(0) @map("est_usd_cost") @db.Decimal(12, 6)
  model       String?
  createdAt   DateTime @default(now()) @map("created_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  job ReviewJob?   @relation(fields: [jobId], references: [id], onDelete: SetNull)
  @@index([orgId, month, createdAt]) // append-only
  @@map("usage_events")
}

model UsageDaily {
  id          String  @id @default(cuid())
  orgId       String  @map("org_id")
  day         String  // "YYYY-MM-DD"
  reviews     Int     @default(0)
  inputTokens Int     @default(0) @map("input_tokens")
  outputTokens Int    @default(0) @map("output_tokens")
  estUsdCost  Decimal @default(0) @map("est_usd_cost") @db.Decimal(12, 6)
  findingCounts Json  // by severity
  @@unique([orgId, day])
  @@map("usage_daily")
}

model OrgBilling {
  orgId                   String  @id @map("org_id")
  provider                String  // "stripe"|"razorpay"
  providerCustomerId      String? @map("provider_customer_id")
  providerSubscriptionId  String? @map("provider_subscription_id")
  plan                    Plan
  status                  BillingStatus
  currentPeriodEnd        DateTime? @map("current_period_end")
  cancelledAt             DateTime? @map("cancelled_at")
  updatedAt               DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@map("org_billing")
}

enum BillingStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  PAUSED
}

model BillingEvent {
  id             String   @id @default(cuid())
  provider       String
  providerEventId String  @map("provider_event_id")
  type           String
  processedAt    DateTime @default(now()) @map("processed_at")
  raw            Json?

  @@unique([provider, providerEventId]) // idempotency
  @@map("billing_events")
}

// ---------------------------------------------------------------- audit / retention

model AuditEvent {
  id        String   @id @default(cuid())
  orgId     String?  @map("org_id")
  actorId   String   @map("actor_id")
  action    String
  targetType String? @map("target_type")
  targetId   String? @map("target_id")
  sourceIp  String?  @map("source_ip")
  meta      Json?
  createdAt DateTime @default(now()) @map("created_at")

  org   Organization? @relation(fields: [orgId], references: [id], onDelete: SetNull)
  actor User?         @relation(fields: [actorId], references: [id], onDelete: SetNull)
  @@index([orgId, createdAt]) // append-only
  @@map("audit_events")
}

model RetentionJob {
  id         String   @id @default(cuid())
  orgId      String   @map("org_id")
  kind       String   // "repo_content_purge" | "findings_expire" | "audit_expire" | "usage_expire"
  target     String   // repo_id / job_id / scope descriptor
  runAt      DateTime @map("run_at")
  status     RetStatus @default(PENDING)
  completedAt DateTime? @map("completed_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@index([status, runAt])
  @@map("retention_jobs")
}

enum RetStatus {
  PENDING
  DONE
  FAILED
}
```

## Notes on Prisma specifics

- **`owner` uniqueness:** Prisma can't express a conditional unique index directly; the "exactly one owner" invariant is a *service-layer* check (on create/role-change) plus a migration-created partial unique index (`CREATE UNIQUE INDEX ... WHERE role='owner'`). The service check is the primary enforcement; the index is the backstop.
- **BigInt FK for `githubRepoId`:** GitHub repo ids exceed int32; Prisma `BigInt` maps to `bigint`.
- **Decimal precision:** `est_usd_cost` uses `DECIMAL(12,6)` (sub-cent resolution across a month), `confidence` `DECIMAL(3,2)`.
- **`onDelete: Cascade`** on tenant children of `Organization` — deleting an org cascades its tenant rows (the hard-purge path, NFR-27); `usage_events.jobId` and `audit_events.*` are `SetNull` so the *records* survive the rows they reference being purged (audit integrity, `DATABASE_DESIGN.md` §6).
