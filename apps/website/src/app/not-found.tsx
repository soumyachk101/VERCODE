// The on-domain 404 (IA §3.1's state: "a helpful 404 … + the 5 top
// links"; the `WFR-105` "not an SEO trap" rule — a 200-with-a-404-body
// is the named fail).
//
// **The static-host note (the DEPLOYMENT_AND_TESTING.md §1 static-host
// config note, the `WFR-105` resolution):** with `output: "export"`,
// Next emits `out/404.html`. The static host (a `Cloudflare Pages`
// dev bucket / a `Vercel` prod CDN, the `U5` decision) must map an
// unknown path → `/404.html` with a **real 404 status** (a catch-all
// redirect, a `_redirects` row). A host that serves the 404 body with
// a 200 status is the SEO trap `WFR-105` names.
//
// **Decision (the IA §3.1 vs. IA §6 resolution):** the IA's §3.1 "a
// helpful 404 with a search box + the 5 top links" is read against
// §6's authoritative P2 rule — "no search box in the header in P2"
// (a `/docs/search` is P3, the `PRD.md §6` out-of-scope list "a
// living docs site with search"). So **no search input is built
// here**; the page shows the 5 top links + a "Back home" CTA.
//
// A server component — the 404 keeps the root layout's chrome
// (`SiteHeader` + `SiteFooter`, the IA §3.1 "a 404 keeps the chrome"
// rule) and renders a static link list. No hooks, no effects.
// No structured data on a 404 (the `STRUCTURED_DATA.md §1` "/404 →
// none" row).

import { TOP_5_LINKS } from "../components/nav-links.js";

export default function NotFound() {
  return (
    <div className="container py-24 md:py-32">
      <div className="mx-auto max-w-[32rem]">
        <h1 className="text-[32px] font-semibold leading-tight text-[var(--text)]">
          Page not found
        </h1>
        <p className="mt-3 text-[16px] leading-[1.65] text-[hsl(var(--muted))]">
          The page you are looking for does not exist — it may have moved,
          or the link may be out of date.
        </p>

        {/* The 5 top links (IA §3.1's "the 5 top links"; the exact set
            is the brief's `/`, `/pricing`, `/docs/quickstart`,
            `/features`, `/faq`). */}
        <nav aria-label="Top links" className="mt-8">
          <p className="footer-col-title mb-3">Where to go next</p>
          <ul className="space-y-2">
            {TOP_5_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="nav-link text-[16px]">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <a href="/" className="btn-cta mt-10">
          Back home
        </a>
      </div>
    </div>
  );
}
