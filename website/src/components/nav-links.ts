import { GITHUB_REPO, signinUrl, srcParam } from "@/lib/site.js";

/**
 * The site's shared link constants — the header + footer read from one
 * source of truth (a DEPLOYMENT_AND_TESTING.md check: a link that's in
 * the header but not the footer is a crawl-coverage defect; this module
 * is the guard).
 *
 * The internal routes follow the `trailingSlash: true` convention
 * (next.config.mjs). The external repo URL is the `STRUCTURED_DATA.md`
 * `Organization.sameAs` value (the `GITHUB_REPO` in `lib/site.ts`).
 *
 * The CTA links come from `lib/site.ts`'s helpers (the `signinUrl` +
 * `srcParam` — the `WFR-501/504` contract: the primary CTA on `/`
 * is `/signin`, carrying a `?src=web-{page}` beacon param.
 */

export interface NavLink {
  readonly label: string;
  readonly href: string;
  /** A true for an external link (a `rel="noopener"` target, the GitHub
   *  row in the footer). */
  readonly external?: boolean;
}

/** The repo URL (the `Organization.sameAs`, `STRUCTURED_DATA.md §3.1`)
 *  — re-exported from `lib/site.ts` so the footer + the JSON-LD share
 *  one literal. */
export { GITHUB_REPO };

/** The header nav (IA §4's "the product mark + the wordmark (left);
 *  the nav links — Features, Docs, Changelog, Blog (right)"). */
export const NEXT_LINKS: readonly NavLink[] = [
  { label: "Features", href: "/features/" },
  { label: "Docs", href: "/docs/" },
  { label: "Changelog", href: "/changelog/" },
  { label: "Blog", href: "/blog/" },
];

/** The footer's 4 columns (DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3: "a 4 col
 *  (Product / Resources / Company / Legal) + a social row"). The 5 legal
 *  routes (`/legal/terms`, `/legal/privacy`, `/legal/security`,
 *  `/legal/dpa`, `/legal/status`) all ship in WP3 (the ROADMAP's "the
 *  5 legal pages ship in WP3"), so the links are real even though the
 *  pages land in the other agent's tree. */
export const FOOTER_LINKS: readonly {
  title: string;
  links: readonly NavLink[];
}[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features/" },
      { label: "Changelog", href: "/changelog/" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/docs/" },
      { label: "Blog", href: "/blog/" },
      { label: "GitHub", href: GITHUB_REPO, external: true },
      { label: "Status", href: "/legal/status/" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about/" },
      { label: "Blog", href: "/blog/" },
      { label: "Built in the open", href: GITHUB_REPO, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/legal/terms/" },
      { label: "Privacy", href: "/legal/privacy/" },
      { label: "Security", href: "/legal/security/" },
      { label: "DPA", href: "/legal/dpa/" },
    ],
  },
];

/** The 404's 5 top links (IA §3.1's state: "a helpful 404 … + the 5 top
 *  links"; the brief's exact set: `/`, `/docs/quickstart`,
 *  `/features`, `/faq`). */
export const TOP_5_LINKS: readonly NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Quickstart", href: "/docs/quickstart/" },
  { label: "Features", href: "/features/" },
  { label: "FAQ", href: "/faq/" },
];

/**
 * The primary CTA href (WFR-501/504): the "Start a free review"
 * button on the header → `/signin` with the `?src=web-header` beacon
 * param (the `WFR-504` one first-party cookieless beacon). Built from
 * `lib/site.ts`'s `signinUrl` + `srcParam` so the header and the other
 * page CTAs share one literal (the single-source rule).
 */
export const HEADER_CTA_HREF: string = signinUrl() + srcParam("web-header");
