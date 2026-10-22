# VERCODE — Error Codes

Stable, machine-readable error codes. The web client and any API consumer switch on `code`, never on `message` (messages are human-readable and may change; codes don't).

Every error body:
```json
{ "error": { "code": "UNAUTHENTICATED", "message": "Your session has expired.", "details": { } } }
```

## 1. Code catalog

### 1.1 Auth (401/403/409)
| Code | HTTP | Meaning |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | No session, expired, or revoked. *Identical* for unknown user and wrong password (no user enumeration) |
| `EMAIL_UNVERIFIED` | 403 | Sign-in OK but the account gate (create org, etc.) requires verification |
| `ACCOUNT_LOCKED` | 429 | Temporary lockout after repeated failed sign-in (AC-101) |
| `INVALID_CREDENTIALS` | 401 | Same shape as UNAUTHENTICATED (password reset flow, etc.) |
| `LAST_OWNER` | 409 | Refusing to leave/remove the sole owner of an org |

### 1.2 Tenancy & capability (403/404)
| Code | HTTP | Meaning |
| --- | --- | --- |
| `NOT_FOUND` | 404 | Resource does not exist **OR** the requester is not a member of its org (tenancy denial — no existence oracle, AC-902) |
| `FORBIDDEN` | 403 | In-tenant capability denial (right org, role lacks the capability) |
| `ORG_SUSPENDED` | 403 | The org is in a SUSPENDED state; reads may proceed, mutations blocked |

### 1.3 Validation (422)
| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 422 | Input failed Zod; `details` carries the field-level errors (exact paths, no stack) |
| `WEBHOOK_MALFORMED` | 422 | Verified signature but the body failed the event schema (not enqueued) |
| `WEBHOOK_REJECTED` | 401 | Signature / timestamp / dedup failure on a webhook |
| `BILLING_REJECTED` | 401 | Provider signature failure on a billing webhook |

### 1.4 Quota & policy (409/429)
| Code | HTTP | Meaning |
| --- | --- | --- |
| `QUOTA_EXCEEDED` | 409 | The org's monthly review/token cap is reached; the review is `skipped` (a notice is posted on the PR — this code is what the API returns if a client *directly* requests a review that would exceed quota) |
| `ALREADY_REVIEWED` | 409 | Same commit-SHA already completed (idempotent no-op; the existing job is returned, not a new one) |
| `OVER_BUDGET` | 409 | The diff exceeds the per-review file/line cap; the review will run *degraded* (top-N files) — the code is informational, the review proceeds |

### 1.5 Rate limit (429)
| Code | HTTP | Meaning |
| --- | --- | --- |
| `RATE_LIMITED` | 429 | Per-org / per-user tier exceeded; `Retry-After` set; `details` carries the bucket |

### 1.6 External dependency (502/503/504)
| Code | HTTP | Meaning |
| --- | --- | --- |
| `UPSTREAM_ERROR` | 502 | A verified external call (GitHub/provider) returned an error the retry policy exhausted |
| `SERVICE_UNAVAILABLE` | 503 | A dependency (Postgres/Redis) is down; writes are refused, reads may degrade |
| `GITHUB_RATE_LIMITED` | 429/503 | GitHub's own limit; the operation will be retried with backoff — a *job* carrying this is retried, not failed |

### 1.7 Internal (500)
| Code | HTTP | Meaning |
| --- | --- | --- |
| `INTERNAL_ERROR` | 500 | Unhandled; the safe body hides internals; the full error + correlation id is in Sentry. **A 500 that returns any stack/env/DB detail is a security defect (NFR-08).** |

## 2. Rules

1. **`code` is stable.** A code, once shipped, is not repurposed or removed (consumers key on it). Deprecated codes are sunset, not deleted.
2. **`message` is free-form.** It's for a human; the client never parses it.
3. **No PII, no secrets, no stack in `details`.** `details` carries structured, safe data (field paths, retry-after, the existing job id on 409s). A `details` blob that contains a password/DB URL/secret is a redaction defect (`ST-redaction-*`).
4. **Webhooks are a special class.** A rejected webhook returns a *minimal* 401/422 (no body that leaks internals beyond the code) and is audit-logged. GitHub retries on 5xx; a *permanent* reject (401/422) is not retried by GitHub, which is correct — we don't want a forged webhook retried against us.
5. **Idempotent 409s return the existing resource.** `ALREADY_REVIEWED` and `QUOTA_EXCEEDED` (direct-request path) include the existing job/skip state in `details` so a client can observe the result without a second call.

## 3. The client-side contract

The web API client maps `code` → a typed result:
- `UNAUTHENTICATED` → redirect to sign-in (a session expiry is the common case).
- `NOT_FOUND` (tenancy) → the resource pane shows "not found / no access" (the UI *can't* tell cross-org from truly-gone — by design, the 404 hides it).
- `FORBIDDEN` → the action is disabled/hidden for this role (a UI that shows a 403 path is a state where the hide-logic drifted from the capability matrix — flag it in the E2E security suite).
- `RATE_LIMITED` → back off per `Retry-After`; surface a "slow down" toast, not an error state.
- `QUOTA_EXCEEDED` → surface the billing/uplift banner (the J4 journey), not an error.

## 4. Audit linkage

Every 401/403/404 on a *tenant* route writes an `audit_events` row (`access.denied`, `meta.reason`). An INTERNAL_ERROR writes a Sentry capture with the correlation id (no audit row — the 500 is a platform fault, not a tenant action, though the *attempted* action is recorded if known).
