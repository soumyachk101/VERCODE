# VERCODE — Authentication

The auth model for the dashboard API. Webhooks are *not* session-authenticated (they're public + HMAC-verified — see `WEBHOOK_SPECIFICATION.md`); this document covers the human/API session path.

## 1. Credentials

- **Email + password** (MVP). Passwords: Argon2id (memory 64 MiB, iterations 3, parallelism 4), salted per user. Never stored plaintext; the DB holds only the hash.
- **Email verification:** a one-time tokenized link sets `users.email_verified`; unverified accounts can sign in but cannot create an org (the onboarding gate).
- **Passkeys / SSO (P1):** a `UserCredential` extension (P1) — the session model below is credential-agnostic, so adding an OIDC/Passkey credential is additive, not a redesign.

## 2. Sessions

- **Mechanism:** server-side session, signed + stored. The cookie carries a random opaque token (the session id); the DB (`sessions`) stores its **hash** + expiry + `revoked_at`. A DB leak does not yield usable session tokens.
- **Cookie flags:** `HttpOnly` (no JS read), `Secure` (TLS only), `SameSite=Lax` (CSRF posture for the same-origin API), `Path=/`.
- **Expiry:** idle 12 h (sliding on activity), absolute 30 d (hard cap). Whichever is earlier.
- **Revocation:** individual session revocation (from `/me/sessions`) sets `revoked_at`; "sign out everywhere" revokes *all* the user's sessions. A revoked token → 401 on the next request (checked against the session row, not just the signature).

## 3. Sign-in flow

```
POST /auth/signin { email, password }
  → verify Argon2id hash
  → on success: create session row, set the cookie, return 200 { user, orgs }
  → on failure: 401 (no user-existence reveal: a *wrong password* and a *no such user* both return the same 401 shape)
  → 5 failures in 15 min for the email → 30-min temporary lock (AC-101)
```

**No user-enumeration:** the sign-in failure response is identical for "user not found" and "wrong password" (both `UNAUTHENTICATED`). Lockout is keyed by the *email*, not the user row, so an attacker cannot distinguish a real account from a fake one.

## 4. Password reset

- A tokenized email link (a hashed token in the DB, 30-min TTL, single-use). The reset sets a new Argon2id hash **and revokes all sessions** for that user (a stolen session can't survive a password change).

## 5. The session middleware

```
request → read cookie → look up session row by token hash
  → row missing / revoked / expired → 401 UNAUTHENTICATED
  → valid → bind { userId, orgs, roleInRequestedOrg, capabilities } to the request context
    (the org + role come from the requested org_id + the membership row)
```

The *role* and *capabilities* are resolved per-request against the *requested* org (a user may be admin in org A and viewer in org B). The capability matrix is PRD §6, enforced by the capability middleware (a route declares its required capability; 403 if the role lacks it).

## 6. Account & org lifecycle (FR-107, P1)

- **User leave:** a member leaves an org → membership row invalidated (soft, audited) → their findings/actions remain attributed (audit integrity) but they lose access.
- **Org deletion:** owner-triggered; a soft-delete + grace window + hard-purge cascade (retention, `DATA_RETENTION.md` §5). The session for a DELETED org is rejected by the tenancy middleware.
- **Deactivate (admin):** a member's access is suspended without deleting their data (a reversible state).

## 7. Security properties

| Property | How |
| --- | --- |
| No PII in the session token | The token is random; the DB stores its hash |
| No user enumeration | Identical 401 shapes; lockout keyed by email |
| No session fixation | A new session row per sign-in; the token is rotated on privilege change |
| Immediate revocation | "Sign out everywhere" sets `revoked_at` on all the user's sessions |
| Password change kills sessions | Reset revokes all sessions for the user |
| Secure-by-default cookie | HttpOnly + Secure + SameSite=Lax |

## 8. Webhook & API split (why it's safe)

The *human* path is cookie-session; the *machine* path (GitHub webhooks, billing webhooks) is HMAC/provider-signature. The two never mix: a webhook handler never reads the session cookie, and a session route never trusts a raw HMAC. This split is what makes "a forged webhook" and "a stolen session" *separate* threat classes with separate mitigations (`SECURITY/THREAT_MODEL.md`).
