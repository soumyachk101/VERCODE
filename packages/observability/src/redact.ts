// The redaction gate (SECRETS_MANAGEMENT.md §3, the "a secret that reaches
// a log is a released secret" invariant).
//
// `redact(text)` scans for a battery of secret shapes and masks them:
// - OpenAI/Anthropic keys (a the `sk-...` shape — a the last-4 are kept for
//   the operator correlation).
// - GitHub keys (a the `ghp_...` / `gho_...` / `ghs_...` /
//   `github_pat_...` shapes).
// - Stripe keys (a the `pk_live_...` / `sk_live_...` / `pk_test_...` /
//   `sk_test_...` shapes).
// - Webhook secrets (a the `whsec_...` Stripe webhook signing secret).
// - PEM blocks (a the `-----BEGIN ... PRIVATE KEY-----` … `-----END …-----`).
// - Env-var-shaped secrets (a the `OPENAI_API_KEY=…` / `DATABASE_URL=…` —
//   a the name is kept, a the value is masked to `***`).
// - JWTs (a the `eyJ…` three-part base64url token — a the header + payload
//   + sig).
// - AWS access key ids (a the `AKIA…` shape).
// - A generic high-entropy token (a the last-resort mask: a random 24+
//   char mixed token that's not a known shape — a the "a new shape that
//   leaks → a add the pattern" response, SECRETS_MANAGEMENT.md §6).
//
// The masked form keeps the shape + the last-4 (a an operator can still
// correlate "which key is this" without exposing the secret): `sk-...abcd`,
// `OPENAI_API_KEY=***`, `ghp_...mnop`.
//
// The gate runs on: every structured log record before it's written (the
// logger's transport), every stored `review_findings.payload` before it's
// persisted (the engine's post-processing), and every provider-bound prompt
// pre-send (SECRETS_MANAGEMENT §3 "a the redaction is a gate, not
// best-effort").

// ---------------------------------------------------------------------------
// The shape → mask map (a the deterministic masks)
// ---------------------------------------------------------------------------

export interface RedactResult {
  /** The masked text. */
  text: string;
  /** True when any secret-shape was found + masked (a the audit's "did the
   * redactor fire" flag). */
  changed: boolean;
  /** The number of secret occurrences masked. */
  count: number;
}

// A the PEM block (a multi-line private key / certificate): the full block
// is replaced with a one-line marker (a the PEM shape is recognisable + a
// a real key is > 100 chars — a the block is the secret, not the header).
const PEM_RE =
  /-----BEGIN [A-Z0-9 ]+?(?:PRIVATE KEY|CERTIFICATE|ENCRYPTED PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY|OPENSSH PRIVATE KEY)-----[\s\S]*?-----END [A-Z0-9 ]+?(?:PRIVATE KEY|CERTIFICATE|ENCRYPTED PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY|OPENSSH PRIVATE KEY)-----/g;

// The generic env-var-shaped secret (a the `OPENAI_API_KEY=…` /
// `DATABASE_URL=…` / `service_token=…` — a the name is kept, a the value
// is masked to `***`).
const ENVVAR_RE = /([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*_(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|DSN|URL|WEBHOOK_SECRET|CREDENTIAL|CREDENTIALS))\s*=\s*(\S+)/gi;

// The Stripe webhook signing secret (a the `whsec_` + 8+ char base64url).
const WHSEC_RE = /\bwhsec_[A-Za-z0-9_-]{8,}\b/g;

// The Stripe public keys (a the `pk_live_` / `pk_test_` + 8+ char).
const STRIPE_RE = /(?<![A-Za-z0-9])[pk]_(?:live|test)_[A-Za-z0-9]{8,}/g;

// The GitHub tokens (a the `ghp_` / `gho_` / `ghs_` / `ghr_` /
// `github_pat_` + 16+ char).
const GITHUB_RE = /(?<![A-Za-z0-9_])(?:github_pat_[A-Za-z0-9_]{16,}|gh[opsru]_[A-Za-z0-9]{16,})/g;

// The generic `sk-` prefix (a the OpenAI + Anthropic's shared shape).
const SK_RE = /\bsk-[A-Za-z0-9_-]{8,}\b/g;

// The JWT (a the `eyJ` three-part base64url token — a the header + payload
// + sig, a the JSON web token's recognisable `eyJ` start).
const JWT_RE = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

// The AWS-style access key id (a the `AKIA` + 16-char).
const AWS_RE = /\bAKIA[A-Z0-9]{16}\b/g;

// The generic high-entropy token (a the last-resort mask): a the token
// boundary excludes the `.` / `=` / `-` punctuation (a a `https://…` link
// is not a secret; a the `postgres://user:pass@host` DSN is handled by the
// env-var rule; a a the `...` / `=***` masked markers are excluded so the
// gate is idempotent).
const ENTROPY_RE = /[A-Za-z0-9_+/:][A-Za-z0-9_+/:]{23,}/g;

// A the high-entropy minimum length (a a random secret is long; a a word is
// not).
const ENTROPY_MIN_LEN = 24;

function last4Of(value: string): string {
  return value.length >= 4 ? value.slice(-4) : value;
}

/**
 * A the high-entropy heuristic: a random secret has ≥ 3 distinct character
 * classes (a lower + a upper + a digit); a a word (all-lower) does not, and
 * neither does a git sha (a the 40-hex identifier).
 */
function isHighEntropyToken(s: string): boolean {
  if (s.length < ENTROPY_MIN_LEN) return false;
  // A a commit sha (a the 40-hex is a git identifier, not a secret).
  if (s.length === 40 && /^[0-9a-f]{40}$/.test(s)) return false;
  let lower = false;
  let upper = false;
  let digit = false;
  let other = false;
  for (const c of s) {
    if (c >= "a" && c <= "z") lower = true;
    else if (c >= "A" && c <= "Z") upper = true;
    else if (c >= "0" && c <= "9") digit = true;
    else other = true;
  }
  const classes = (lower ? 1 : 0) + (upper ? 1 : 0) + (digit ? 1 : 0) + (other ? 1 : 0);
  return classes >= 3;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Run the redaction gate (a the SECRETS_MANAGEMENT §3 "a a secret that
 * reaches a log is a released secret" invariant). Every secret-shaped value
 * is masked to its type + last-4 (a an operator can correlate "which key
 * is this" without exposing the secret).
 *
 * The rules run in a fixed order — a the specific shapes before a the
 * generic (a a `ghp_…` is a GitHub shape, not a "random token"; a a
 * `sk-…` is a provider key, not a random token) — and each masked result is
 * parked behind a placeholder, so a later rule cannot re-mask it and a
 * re-run over the masked text is a no-op (a the gate is idempotent).
 */
export function redact(input: string): RedactResult {
  let text = input;
  let count = 0;
  const parked: string[] = [];

  // A the mask parking (a the placeholder is a NUL-delimited token — a it
  // cannot collide with a the secret's own characters).
  const park = (masked: string): string => {
    parked.push(masked);
    return `\u0000VERCODE_MASK_${parked.length - 1}\u0000`;
  };

  // A the PEM block first (a the multi-line private key — a the
  // highest-risk shape; a the full block is the secret).
  text = text.replace(PEM_RE, () => {
    count += 1;
    return park("[REDACTED_PEM_PRIVATE_KEY]");
  });

  // A the env-var-shaped secret (a the `OPENAI_API_KEY=…` — a the name is
  // kept, a the value is masked).
  text = text.replace(ENVVAR_RE, (match, name: string) => {
    count += 1;
    return park(`${name}=***`);
  });

  // A the `whsec_` webhook secret (a the Stripe webhook signing secret — a
  // the `whsec_` prefix is a recognisable shape).
  text = text.replace(WHSEC_RE, (match) => {
    count += 1;
    return park(`whsec_...${last4Of(match)}`);
  });

  // A the Stripe keys (a the `pk_live_` / `pk_test_` shape).
  text = text.replace(STRIPE_RE, (key: string) => {
    count += 1;
    // A keep the `pk_live_` / `pk_test_` prefix (a the shape) + a last-4.
    const prefix = key.slice(0, key.indexOf("_", 3) + 1); // a the `pk_live_`
    return park(`${prefix}...${last4Of(key)}`);
  });

  // A the GitHub tokens (a the `ghp_` / `github_pat_` shape).
  text = text.replace(GITHUB_RE, (key: string) => {
    count += 1;
    const prefix = key.startsWith("github_pat_") ? "github_pat_" : key.slice(0, key.indexOf("_"));
    return park(`${prefix}...${last4Of(key)}`);
  });

  // A the generic `sk-` prefix (a the OpenAI + Anthropic's shared shape).
  text = text.replace(SK_RE, (match) => {
    count += 1;
    return park(`sk-...${last4Of(match)}`);
  });

  // A the JWT (a the `eyJ…` three-part token — a the header + payload +
  // sig; a the full token is masked to a marker + a last-4 of the sig).
  text = text.replace(JWT_RE, (match) => {
    count += 1;
    const sig = match.split(".").pop() ?? "";
    return park(`JWT...${last4Of(sig)}`);
  });

  // A the AWS access key id (a the `AKIA` + 16-char shape).
  text = text.replace(AWS_RE, (match) => {
    count += 1;
    return park(`AKIA...${last4Of(match)}`);
  });

  // A the generic high-entropy token (a the last-resort mask — a a 24+
  // char mixed token that's not a known shape; a the "a new shape that
  // leaks → a add the pattern" response, SECRETS_MANAGEMENT §6). A a word
  // (a an all-lower identifier) is not a secret; a a 40-hex commit sha is
  // not a secret. A the masked-value markers (`=***` / `...abcd`) are
  // excluded (a the idempotency — a a re-run over the masked text is a
  // no-op).
  text = text.replace(ENTROPY_RE, (match) => {
    if (match.endsWith("***") || match.includes("...")) return match;
    if (!isHighEntropyToken(match)) return match;
    count += 1;
    // A the `name=value` env-var form keeps the `=***` mask; a the bare
    // token is masked to `...last-4`.
    const eq = match.match(/^([\w]+)=(.*)$/);
    if (eq && eq[2].length >= ENTROPY_MIN_LEN) {
      return park(`${eq[1]}=***`);
    }
    return park(`...${last4Of(match)}`);
  });

  // A the unparking (a the masks return to the text).
  text = text.replace(/\u0000VERCODE_MASK_(\d+)\u0000/g, (_m, i: string) => parked[Number(i)] ?? "");

  return { text, changed: count > 0, count };
}
