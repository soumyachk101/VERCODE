# VERCODE — System Architecture

## 1. Component Diagram

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js dashboard apps/web]
  end
  subgraph Services
    API[Fastify API apps/api]
    WORKER[BullMQ worker apps/worker]
  end
  subgraph Data
    PG[(PostgreSQL)]
    RD[(Redis: sessions, queues, diff-cache)]
  end
  subgraph External
    GH[GitHub App + REST + user OAuth]
    AI[AI providers: OpenAI / Anthropic / Ollama]
    OBS[Sentry + OTel collector]
  end
  subgraph Analysis
    ST[Static analysis: ESLint + Semgrep]
  end

  UI -->|REST + session cookie| API
  UI -->|GitHub OAuth (user connect)| GH
  GH -->|signed webhooks| API
  API -->|verify + enqueue| RD
  API --> PG
  API -->|GitHub OAuth callback (token exchange)| GH
  RD -->|review-queue| WORKER
  WORKER --> PG
  WORKER --> ST
  ST -->|deterministic findings| WORKER
  WORKER --> AI
  AI -->|structured findings| WORKER
  WORKER --> GH|publish review + comments|
  API & WORKER --> OBS
  UI --> API
```

## 2. Request-Path Diagrams

### 2.1 Webhook → Review (the hot path)

```mermaid
sequenceDiagram
  participant GH as GitHub
  participant API as API
  participant RD as Redis queue
  participant W as Worker
  participant PG as Postgres
  participant AI as AI provider
  participant ST as Static analysis

  GH->>API: POST /webhooks/github (pull_request.opened, signed)
  API->>API: verify HMAC + timestamp window + delivery-id dedup
  API->>PG: record webhook receipt (idempotency)
  API->>RD: enqueue review-queue job {jobId, orgId, repoId, pr, sha}
  API-->>GH: 202 Accepted (< 300 ms, no LLM on this path)
  RD->>W: dequeue job
  W->>PG: load durable state (org, settings) — never trust payload for authz
  W->>GH: fetch PR diff + bounded context
  par deterministic stage
    W->>ST: ESLint + Semgrep on changed files
    ST-->>W: static findings
  and AI stage
    W->>AI: completeStructured(task, schema)
    AI-->>W: raw AI findings
  end
  W->>W: merge → validate (line-exists, enums) → dedup → policy (floor, suppression) → summary
  W->>PG: persist findings + job state + usage events
  W->>GH: create review (summary) + inline comments (validated anchors)
  W->>PG: mark job succeeded, store published review id
```

### 2.2 Dashboard read

```mermaid
sequenceDiagram
  participant UI as web
  participant API as api
  participant PG as pg
  participant RD as redis
  UI->>API: GET /api/v1/orgs/:id/usage?range=30d (cookie)
  API->>API: auth + tenant context (orgId, role)
  API->>RD: check usage rollup cache (org-scoped key)
  alt cache hit
    RD-->>API: cached rollup
  else miss
    API->>PG: read usage_daily rollup (org-scoped, indexed)
    API->>RD: write cache (TTL 5 min)
  end
  API-->>UI: JSON (usage charts)
```

## 3. Process Boundaries

- **`api`** — owns: auth, dashboard REST, webhook ingress (verify+enqueue), GitHub OAuth routes (user connect + callback + disconnect), config endpoints. *Never* runs the review pipeline.
- **`worker`** — owns: dequeue → fetch → analyze (static + AI) → validate → publish → account. May scale to N instances; each enforces its own concurrency limit (default 4) and org-shard awareness.
- **`web`** — stateless frontend; all data via `api`. No direct DB or GitHub access.

## 4. Data Flow

See `DATA_FLOW.md` for field-level flow (what crosses each boundary, and what must never cross it — e.g., secrets, raw diffs to AI providers beyond bounded context, client-supplied usage state).

## 5. Deployment Boundaries

Three containers, one Postgres, one Redis. `web` and `api` scale horizontally and statelessly. `worker` autoscales on queue depth. The static-analysis stage is a *sub-process of the worker* in MVP (still isolated: its own CPU/mem limits, no production credentials) and becomes a *separate sandboxed runner* in Phase 2 when untrusted code execution is enabled.
