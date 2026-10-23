import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The marketing shell: a sticky VERCODE header + a section nav + a footer,
 * used by the landing, /blog, and /changelog surfaces.
 *
 * NOTE — color tokens: hsl(var(--token)) with HSL triplets defined in
 * globals.css :root (--background, --foreground, --muted, --muted-foreground,
 * --accent, --accent-foreground, --border, --panel, --line, --highlight,
 * --success, --text-1, --text-2, --text-3).
 */

const NAV = [
  { label: "Blog", href: "/blog" },
  { label: "Changelog", href: "/changelog" },
];

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <Header />
      <main className="">{children}</main>
      <Footer />
    </div>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[hsl(var(--line))] bg-[hsl(var(--background))]">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5" aria-label="VERCODE home">
          <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[var(--accent-color)] font-mono text-[15px] font-bold text-[hsl(var(--accent-foreground))]">
            V
          </span>
          <span className="text-[15px] font-semibold tracking-[0.14em]">VERCODE</span>
        </a>
        <nav className="flex items-center gap-4 sm:gap-6" aria-label="Site">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hidden text-[13px] font-medium text-[hsl(var(--text-2))] transition-colors hover:text-[hsl(var(--text-1))] sm:inline"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/signin"
            className="rounded-[6px] border border-[hsl(var(--line))] px-3.5 py-1.5 text-[13px] font-medium text-[hsl(var(--text-1))] transition-colors hover:border-[var(--accent-color)] hover:text-[var(--accent-color)]"
          >
            Sign in
          </Link>
          <Link
            href="/signin"
            className="rounded-[6px] bg-[var(--accent-color)] px-3.5 py-1.5 text-[13px] font-semibold text-[hsl(var(--accent-foreground))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[hsl(var(--line))] bg-[hsl(var(--panel))]">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[var(--accent-color)] font-mono text-[13px] font-bold text-[hsl(var(--accent-foreground))]">
                V
              </span>
              <span className="text-[14px] font-semibold tracking-[0.14em]">VERCODE</span>
            </div>
            <p className="mt-4 max-w-[240px] text-[13px] leading-relaxed text-[hsl(var(--text-3))]">
              The Git-native AI code review and enforcement platform. Your rules,
              enforced on every merge.
            </p>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[hsl(var(--text-3))]">
              Product
            </h3>
            <ul className="mt-3 space-y-2.5">
              <li>
                <Link href="/" className="text-[13px] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/overview" className="text-[13px] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/changelog" className="text-[13px] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]">
                  Changelog
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[hsl(var(--text-3))]">
              Resources
            </h3>
            <ul className="mt-3 space-y-2.5">
              <li>
                <Link href="/blog" className="text-[13px] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/signin" className="text-[13px] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text-1))]">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[hsl(var(--text-3))]">
              Status
            </h3>
            <p className="mt-3 flex items-center gap-2 text-[13px] text-[hsl(var(--text-2))]">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" aria-hidden="true" />
              All systems operational
            </p>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-[hsl(var(--line))] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-[hsl(var(--text-3))]">
            © 2026 VERCODE. All rights reserved.
          </p>
          <p className="text-[12px] text-[hsl(var(--text-3))]">
            Built by the VERCODE team · MIT-licensed core
          </p>
        </div>
      </div>
    </footer>
  );
}
