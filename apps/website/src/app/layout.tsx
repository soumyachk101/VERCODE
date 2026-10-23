import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/globals.css";
import "@/styles/layout.css";
import "@/styles/prose.css";
import { RevealObserver } from "@/components/RevealObserver.js";
import { SiteFooter } from "@/components/SiteFooter.js";
import { SiteHeader } from "@/components/SiteHeader.js";

// No external font requests (WNFR-04/05's self-hosted-assets rule):
// the typefaces come from the `--font-sans` / `--font-mono` system
// stack in `globals.css` — no `next/font`, no Google Fonts link tag
// (a Lighthouse network-trace check, a `WNFR-04` violation if
// present).

export const metadata: Metadata = {
  // The canonical origin (WFR-102/103's robots + sitemap + og:url source,
  // the TECHNICAL_ARCHITECTURE.md §6's VERCODE_WEBSITE_BASE_URL env, a
  // default for the static export's build-time read).
  metadataBase: new URL(process.env.VERCODE_WEBSITE_BASE_URL ?? "https://vercode.com"),
  title: {
    default: "Vercode — Ship better code. Catch bugs earlier.",
    template: "%s — Vercode",
  },
  // The description is inlined (140 chars): the `lib/site.ts` canonical
  // copy lands with the parallel lib work — keep this in sync.
  description:
    "Vercode is AI code review that's deterministic-first: static analysis runs before the model, findings are evidence-backed, cost stays bounded.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Vercode",
    // `/og.png` is a placeholder: the OG image build task (the
    // `STRUCTURED_DATA` / `PERFORMANCE_AND_ACCESSIBILITY` docs' "a
    // VERCODE-default OG image (1200×630)", a `WFR-404` build-time
    // asset) fills it in at build time.
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vercode — Ship better code. Catch bugs earlier.",
    description:
      "Vercode is AI code review that's deterministic-first: static analysis runs before the model, findings are evidence-backed, cost stays bounded.",
  },
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* The no-JS-crawler fallback: a 3-line inline script adds a
            `.js` class to `<html>` before first paint. `globals.css`
            hides `.reveal` elements *only* when that class is
            present (`.js .reveal { opacity: 0 }`), so a no-JS
            crawler (or a JS failure) always sees every element. */}
        <script
          dangerouslySetInnerHTML={{
            __html: 'document.documentElement.classList.add("js");',
          }}
        />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        {/* The one IntersectionObserver for the whole site
            (DESIGN_SYSTEM_AND_TYPOGRAPHY.md §5's one-time
            scroll-reveal). */}
        <RevealObserver />
      </body>
    </html>
  );
}
