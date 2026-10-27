# VERCODE — ERD

Mermaid ERD of the core schema. Field-level detail is in `SCHEMA_REFERENCE.md`; constraints rationale in `DATABASE_DESIGN.md`.

```mermaid
erDiagram
  users ||--o{ sessions : "has"
  users ||--o{ github_oauth_states : "pending OAuth states"
  users ||--o{ memberships : "member of"
  organizations ||--o{ memberships : "has"
  organizations ||--o{ invitations : "invites"
  organizations ||--o{ github_installs : "installs"
  organizations ||--o{ org_settings : "configures"
  organizations ||--o{ byok_keys : "stores"
  organizations ||--o| org_billing : "billed via (DORMANT)"
  organizations ||--o{ usage_events : "accumulates"
  organizations ||--o{ audit_events : "audited by"
  organizations ||--o{ retention_jobs : "purged by"
  github_installs ||--o{ github_repos : "connects"
  github_installs ||--o{ webhook_deliveries : "receives"
  github_repos ||--o{ repo_rules : "configures"
  github_repos ||--o{ review_jobs : "generates"
  review_jobs ||--o{ review_findings : "yields"
  review_jobs ||--o{ usage_events : "accounts"
  review_findings ||--o{ finding_actions : "acted on"
  organizations ||--o{ model_routes : "routes AI via"

  users {
    string id PK
    string email UK "verified"
    string password_hash "argon2id"
    bool email_verified
    string github_provider_token "per-user OAuth token (nullable)"
    string github_handle "connected login (nullable)"
    datetime created_at
  }

  sessions {
    string id PK
    string user_id FK
    string token_hash UK "hashed session token"
    inet source_ip
    string user_agent
    datetime expires_at
    datetime revoked_at
  } "idx (user_id)"

  github_oauth_states {
    string id PK
    string token UK "anti-CSRF state, 10-min TTL"
    string user_id FK
    string redirect_to
    datetime expires_at
    datetime used_at "set once consumed"
  } "idx (user_id)"

  organizations {
    string id PK
    string slug UK
    string name
    string plan "legacy classification, inert (no-paywall)"
    string status "active|suspended|deleted"
    datetime created_at
  }

  memberships {
    string id PK
    string org_id FK
    string user_id FK
    string role "owner|admin|developer|viewer"
    datetime created_at
  } "UK (org_id, user_id)"

  github_installs {
    string id PK
    string org_id FK
    string github_installation_id FK
    string account_type
    string account_login
    string status "active|removed"
    string repository_selection "all|specific"
  } "UK (org_id, github_installation_id)"

  github_repos {
    string id PK
    string org_id FK
    string install_id FK
    string github_repo_id FK
    string full_name
    string default_branch
    bool connected
    datetime disabled_at
  } "UK (org_id, github_repo_id)"

  review_jobs {
    string id PK
    string org_id FK
    string repo_id FK
    int pr_number
    string commit_sha
    string status "queued|running|succeeded|failed|skipped|partial"
    string skip_reason
    string model
    string prompt_version
    int input_tokens
    int output_tokens
    decimal est_usd_cost
    string published_github_review_id
    datetime created_at
    datetime finished_at
  } "UK (org_id, repo_id, pr_number, commit_sha)"

  review_findings {
    string id PK
    string job_id FK
    string source "eslint|semgrep|ai_deep|ai_security|deterministic_summary"
    string file
    int line
    string severity "low|medium|high|critical"
    string category "enum (contracts)"
    string title
    string description
    string suggested_fix
    decimal confidence "0..1"
    string anchor_status "inline|anchor_failed|pr_body"
    jsonb payload
    datetime created_at
  }

  usage_events {
    string id PK
    string org_id FK
    date month
    int review_count
    int input_tokens
    int output_tokens
    decimal est_usd_cost
    string model
    datetime created_at
  } "append-only"

  org_billing {
    string org_id PK+FK
    string provider "stripe|razorpay"
    string provider_customer_id
    string provider_subscription_id
    string plan
    string status "trialing|active|past_due|canceled|paused"
    datetime current_period_end
    datetime cancelled_at
  } "DORMANT — retained in schema; no live code path (billing removed, no-paywall)"

  audit_events {
    string id PK
    string org_id FK
    string actor_id
    string action
    string target_type
    string target_id
    inet source_ip
    jsonb meta
    datetime created_at
  } "append-only"
```

## Invariants encoded by the ERD

- **Every tenant-owned entity** (`github_*`, `review_*`, `usage_events`, `audit_events`, `org_*` config) hangs off `organizations` — the tenancy root. No orphan tenant row.
- **`review_jobs`'s composite unique key** `(org_id, repo_id, pr_number, commit_sha)` *is* the idempotency design (ADR-007); a redelivery cannot create a second completed job for the same commit.
- **`usage_events` / `audit_events` are leaves with no update edge** — append-only by shape.
- **`org_billing` / `billing_events` are DORMANT** — retained in the schema after the billing feature was removed; `organizations.plan` is inert under the no-paywall state, and usage reporting (`usage_events`) is the live cost path (see `DATABASE_DESIGN.md` §3).
- **`memberships` partial-unique on `role='owner'`** enforces exactly one owner per org.
