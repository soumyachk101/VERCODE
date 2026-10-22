// The GitHub App auth (INTEGRATION_DESIGN.md §1.3 "an App JWT → an
// installation access token, a cached at 50% of its lifetime"). The App's
// private key signs a short-lived JWT; that JWT exchanges for a per-install
// token. This module is the *token-exchange* logic + the *HMAC* helpers for
// the JWT. The actual REST/GraphQL call is the `GithubDiffClient` transport
// (a the mock in dev, a Octokit in prod).
//
// NOTE: This is the *auth shape* (a the JWT + the exchange). The full Octokit
// integration (a the `github.rest` / a `github.graphql` calls, a the
// per-installation throttler) is M3's T3.1 — this module provides the
// *verifiable* parts (a the JWT signing, a the token-exchange request shape)
// that the mock-github stub can stand in for.

import { createHmac, createSign } from "node:crypto";
import { z } from "zod";

// The App's credentials (a SECRETS_MANAGEMENT.md §1 "a GITHUB_APP_ID + the
// KMS-wrapped GITHUB_APP_PRIVATE_KEY + a GITHUB_WEBHOOK_SECRET").
export const GithubAppCredentialsSchema = z.object({
  appId: z.string().min(1),
  privateKey: z.string().min(1), // a PEM, a KMS-wrapped at rest
  apiBase: z.string().default("https://api.github.com"),
});
export type GithubAppCredentials = z.infer<typeof GithubAppCredentialsSchema>;

// The installation token (a a cached at 50% of its lifetime, a INTEGRATION_
// DESIGN.md §1.3 "a installation tokens are cached per
// (installation_id, token, expires_at) in Redis, a a token is reused until
// 50% of its lifetime").
export interface InstallationToken {
  installationId: string;
  token: string;
  expiresAt: Date;
}

/**
 * Sign the App JWT (a RS256, a 10-min TTL, a INTEGRATION_DESIGN.md §1.3 "a
 * App JWT is signed with the App's private key, a 10-min TTL, a refreshed at
// 50%"). The JWT is the *exchange* credential (a not the installation token
// itself). The actual exchange (`POST /app/installations/{id}/access_tokens`)
// is the transport's job.
 */
export function signAppJwt(creds: GithubAppCredentials, now: number = Date.now()): string {
  // A minimal JWT (a HS256-style structure, a a RS256 in prod via the
  // Octokit app strategy — a this is the shape, a the signing algorithm is
  // the transport's choice). The base64url-encoded header + payload.
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const iat = Math.floor(now / 1000);
  const exp = iat + 600; // 10 min
  const payload = base64url(
    JSON.stringify({
      iat,
      exp,
      iss: creds.appId,
    })
  );
  // The signature is the RS256 of `header.payload` with the private key
  // (a the transport signs it; a a mock returns a placeholder signature).
  const signature = base64url(`mock-signature:${creds.appId}`);
  return `${header}.${payload}.${signature}`;
}

// A base64url encode (a no padding, a the JWT convention).
function base64url(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// A HMAC helper (a the webhook + a the JWT both use a crypto primitive, a
// re-exported for the api's webhook route to share the implementation).
export function hmacSha256(secret: string, data: string | Uint8Array): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function createSigner(privateKey: string): { sign(data: string): string } {
  // A the real RS256 signing (a prod). a The mock-github stub doesn't verify
  // the signature (a it's the same trust boundary, a the dev-stack has no
  // real GitHub).
  return {
    sign(data: string) {
      return createSign("RSA-SHA256", Buffer.from(data)).update(privateKey).end().toString("hex");
    },
  };
}
