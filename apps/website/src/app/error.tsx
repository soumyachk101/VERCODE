"use client";

// The 500 page (IA §3.1's state: "a 500 (an apology + a status link +
// a retry)").
//
// Next requires a root `error.tsx` to be a Client Component (the
// error boundary's `reset` + the retry button are client-only), so
// this file carries "use client" — the only client surface on this
// page.
//
// The retry is a plain `window.location.reload()`: the site is a
// static export (no server state to reset), and a "reload" is the
// honest retry for a rendered page. A `<a href={location.href}>` is
// not portable (a `location` read at render time on the server is a
// hazard), so a tiny client button does it.
//
// The status link is `/legal/status/` (the IA §4 "a 'status' link").

export default function ErrorPage() {
  return (
    <div className="container py-24 md:py-32">
      <div className="mx-auto max-w-[32rem]">
        <h1 className="text-[32px] font-semibold leading-tight text-[var(--text)]">
          Something went wrong
        </h1>
        <p className="mt-3 text-[16px] leading-[1.65] text-[hsl(var(--muted))]">
          We are sorry — this page failed to render. Reload it, and if the
          problem persists, check the service status.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <ReloadButton />
          <a href="/legal/status/" className="nav-link text-[16px]">
            Service status
          </a>
        </div>
      </div>
    </div>
  );
}

// The retry button (a client component: `window.location.reload()`).
function ReloadButton() {
  return (
    <button
      type="button"
      className="btn-cta"
      onClick={() => {
        window.location.reload();
      }}
    >
      Reload
    </button>
  );
}
