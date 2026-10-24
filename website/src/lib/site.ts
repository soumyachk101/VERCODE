/**
 * VERCODE website — site constants and canonical page metadata.
 *
 * Pure data + string builders: no React, no DOM, no Node APIs, so both
 * RSC and client components can import this in the static export.
 */

export const SITE_NAME = "Vercode";
export const TAGLINE = "Ship better code. Catch bugs earlier.";
export const BASE_URL =
  process.env.VERCODE_WEBSITE_BASE_URL ?? "https://vercode.com";
export const GITHUB_REPO = "https://github.com/vercode/vercode";

/**
 * Relative link to the dashboard app. "/signin" is a documented dashboard
 * route; a relative path keeps the static export working on any host —
 * the dashboard and the marketing site are served side by side.
 */
export function signinUrl(): string {
  return "/signin";
}

/** Back-compat alias — some pages still reference the constant form. */
export const SIGNIN_URL = "/signin";

/**
 * WFR-504 beacon param: CTA links carry `?src=web-<slug>` so the dashboard
 * can attribute the signup.
 */
export function srcParam(page: string): string {
  return `?src=web-${page}`;
}

export interface PageDef {
  /** Absolute route, e.g. "/docs/quickstart". The root is "/". */
  route: string;
  /** ≤ 60 chars. */
  title: string;
  /** 120–158 chars, unique per page. */
  description: string;
}

/**
 * The canonical route list. The sitemap builder (llms.ts) and every
 * `<meta>`/`<title>` consumer read from here — it is the single source.
 */
export const PAGES: readonly PageDef[] = [
  {
    route: "/",
    title: "Home",
    description:
      "Set up VERCODE on a pull request: install the GitHub App and get a review verdict with inline findings in under 120 seconds at p50.",
  },
  {
    route: "/features",
    title: "Features — AI code review that a team actually reads",
    description:
      "Static analysis runs first; a task-routed model then reviews the bounded diff. The verdict plus inline findings return to the pull request.",
  },
  {
    route: "/faq",
    title: "FAQ — answers with the actual numbers",
    description:
      "Sixteen questions with literal answers: latency bounds, what is stored and purged, scope lists, and how usage limits work.",
  },
  {
    route: "/docs",
    title: "Documentation — install, GitHub App, API, rules",
    description:
      "Install steps, the GitHub App permission set, the review API, webhooks, custom rules, provider routing, and the retention clauses.",
  },
  {
    route: "/docs/quickstart",
    title: "Quickstart — first review in five minutes",
    description:
      "Install the GitHub App on one repo, open a pull request. A summary comment plus inline findings lands in under 120 seconds at p50.",
  },
  {
    route: "/docs/github-app",
    title: "GitHub App — install and permission scopes",
    description:
      "The install flow, the five requested scopes, what each permits, and how pull_request_target fork reviews run in a sandbox. No admin:org or secrets scopes.",
  },
  {
    route: "/docs/api",
    title: "API — review lifecycle, webhooks, latency",
    description:
      "The review lifecycle: webhook receipt, job queue, publication. Latency bounds at p50 and p95, status codes, the verdict enum, and how to read an audit event.",
  },
  {
    route: "/docs/rules",
    title: "Rules — custom review rules and confidence floors",
    description:
      "Custom rules at org and repo level: the default 0.6 confidence floor, per-category suppression, quiet hours, and per-language toggles with precedence order.",
  },
  {
    route: "/docs/security",
    title: "Security — least-privilege scopes, encryption, retention",
    description:
      "The GitHub App scope set, how BYOK keys are encrypted and KMS-wrapped, the repository content policy, and the hard-delete rule on install revocation.",
  },
  {
    route: "/docs/providers",
    title: "Providers — model routing, BYOK, Ollama",
    description:
      "OpenAI is the first provider; Anthropic and local Ollama adapters route per task. An organization may select any model and send model spend to its own keys.",
  },
  {
    route: "/docs/quotas",
    title: "Quotas — review limits and the skip-with-notice rule",
    description:
      "The full usage table: files per review, concurrency caps, what a degrade means versus a skip, and the cost-cap backstop that guards every month.",
  },
  {
    route: "/docs/privacy",
    title: "Privacy — what is stored and what is purged",
    description:
      "What VERCODE reads, stores, and purges. Raw diffs live only for the review lifetime; findings are retained for the retention window, then hard-deleted on access revocation.",
  },
  {
    route: "/changelog",
    title: "Changelog — dated releases",
    description:
      "Every release in order, oldest at the bottom: the feature added, the behavior changed, and the date, so a reader can jump to the version a team actually runs.",
  },
  {
    route: "/blog",
    title: "Blog — engineering notes",
    description:
      "Notes from the work: a routing change, a dedup fix, a confidence-floor tune. Each post cites the requirement it satisfies and the commit that carries it.",
  },
  {
    route: "/about",
    title: "About — the project and the team",
    description:
      "The license, the repo, the hosted service boundary, and why the pipeline stays out of the open-source tree. Numbers come from the contracts package.",
  },
  {
    route: "/legal/terms",
    title: "Terms of Service",
    description:
      "What a review is, the usage cap with a posted skip notice, data ownership, the measured latency targets, and the clauses to read before you rely on the service.",
  },
  {
    route: "/legal/privacy",
    title: "Privacy Policy",
    description:
      "What VERCODE collects, the retention window, and the hard-delete rule on access revocation. Audit logs keep their 180-day minimum.",
  },
  {
    route: "/legal/security",
    title: "Security — trust, disclosure, and reporting",
    description:
      "The disclosure boundary, how to report a vulnerability, the program scope, and the response window. Links the security docs and the enterprise DPA.",
  },
  {
    route: "/legal/dpa",
    title: "Data Processing Agreement",
    description:
      "The enterprise clauses: the data processed, the subprocessor list, the deletion duty on revocation, and the 180-day audit-log retention floor.",
  },
  {
    route: "/legal/status",
    title: "Status — incident history",
    description:
      "The incident history: each event, its window, the detection time, and the fix. No status marketing, no color-coded theater, just the record as it happened.",
  },
];
