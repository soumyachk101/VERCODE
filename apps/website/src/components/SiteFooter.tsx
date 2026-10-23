import { FOOTER_LINKS, GITHUB_REPO } from "./nav-links.js";

/**
 * The site footer (IA §4 + DESIGN_SYSTEM_AND_TYPOGRAPHY.md §3): a 4-column
 * layout — Product / Resources / Company / Legal — + a social row
 * (GitHub only; X is optional, the DESIGN_SYSTEM's "a social row (GitHub,
 * X)"). No newsletter form (IA §4 rule: "no newsletter form in P2").
 *
 * A bottom row: the © year (build-time, a `new Date().getFullYear()`),
 * a "MIT License" note, + a status link (IA §4's "a 'status' link
 * (`/legal/status`)").
 *
 * The server component — no client-side state, the year is computed
 * at build time (a `output: "export"` static build bakes it in, so a
 * page rebuilt after a year rollover picks up the new value).
 */

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      aria-hidden="true"
      className="text-[var(--faint)]"
    >
      <path
        d="M8 1.375c-3.618 0-6.545 2.927-6.545 6.545 0 2.903 1.881 5.378 4.518 6.288.33.06.448-.14.448-.313 0-.155-.005-.675-.01-1.32-1.844.401-2.24-.813-2.24-.813-.306-.77-.75-1.05-.75-1.05-.61-.446.047-.44.047-.44.675.052 1.03.696 1.03.696.601 1.034 1.58.735 1.965.563.06-.925.317-1.57.575-1.934-1.742-.36-3.58-1.04-3.58-4.644 0-1.02.365-1.85.97-2.506-.097-.24-.42-1.205.093-2.51 0 0 .79-.255 2.583.97.75-.212 1.546-.318 2.342-.321.796.003 1.592.11 2.343.32 1.792-1.224 2.58-.97 2.58-.97.513 1.306.19 2.27.093 2.51.606.656.97 1.486.97 2.506 0 3.61-1.84 4.285-3.586 4.636.283.291.536.858.536 1.728 0 1.248-.011 2.251-.011 2.562 0 .176.114.38.45.31 2.632-.91 4.51-3.384 4.51-6.287C14.545 4.302 11.618 1.375 8 1.375Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SiteFooter() {
  // A build-time © year (the static export bakes this in; a page
  // rebuilt after a year rollover picks up the new value).
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[var(--raised)]">
      <div className="container py-12">
        {/* The 4 columns (IA §4: "a 4 col (Product / Resources /
            Company / Legal) + a *social* row (GitHub, X)"). */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {FOOTER_LINKS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="footer-col-title">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="footer-link"
                      {...(link.external
                        ? { target: "_blank", rel: "noopener" }
                        : {})}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* The social row (IA §4: "a *social* row (GitHub, X)" — a
            single GitHub icon, `--muted`, no stock icon library). */}
        <div className="mt-10 flex items-center gap-4 pt-6">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener"
            aria-label="Vercode on GitHub"
            className="inline-flex items-center justify-center"
          >
            <GitHubIcon />
          </a>
        </div>

        {/* The bottom row: the © year, a "MIT License" note, a status
            link (IA §4: "a 'status' link (`/legal/status`)"). */}
        <div className="mt-6 flex flex-col gap-2 text-[13px] text-[var(--faint)] md:flex-row md:items-center md:justify-between">
          <p className="tnum">© {year} Vercode · MIT License</p>
          <a
            href="/legal/status/"
            className="footer-link text-[13px]"
          >
            Status
          </a>
        </div>
      </div>
    </footer>
  );
}
