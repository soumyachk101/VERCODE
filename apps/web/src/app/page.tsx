import { redirect } from "next/navigation";
import type { Session } from "@/lib/types";

// / — two branches:
//   no session  → the marketing landing page (hero, features, live preview,
//                 how-it-works, blog preview, CTA band).
//   session + a resolved org → /overview (INFORMATION_ARCHITECTURE §3: the
//                 dashboard first, not a KPI wall, for a signed-in user).
//
// The session check is a server-side /auth/me read (cookie, no auth header
// needed — the cookie rides the request). If the API is unreachable the
// server check fails open to the marketing page: a landing page that
// requires a healthy API is not a landing page.
//
// A signed-in user with no org yet (fresh account) stays on the landing
// and the "Sign in" link in the nav resolves to /signin which carries
// them to the org-creation step.

async function getSession(): Promise<{ orgId: string | null }> {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    const res = await fetch(`${apiBase}/api/v1/auth/me`, {
      cache: "no-store",
      redirect: "manual",
    });
    if (!res.ok) return { orgId: null };
    const data = (await res.json()) as { orgs?: Array<{ id: string }> };
    const org = data.orgs?.[0];
    return { orgId: org?.id ?? null };
  } catch {
    // API unreachable: open to the marketing page.
    return { orgId: null };
  }
}

export default async function Home() {
  const { orgId } = await getSession();
  if (orgId) redirect("/overview");
  return <LandingPage />;
}

// Re-export the marketing composition so the page component stays the
// single export (Next.js requires a default export for a route).
async function LandingPage() {
  const { Hero } = await import("@/components/marketing/landing/hero");
  const { Features } = await import("@/components/marketing/landing/features");
  const { LivePreview } = await import("@/components/marketing/landing/live-preview");
  const { HowItWorks } = await import("@/components/marketing/landing/how-it-works");
  const { BlogPreview } = await import("@/components/marketing/landing/blog-preview");
  const { Cta } = await import("@/components/marketing/cta");
  const { MarketingShell } = await import("@/components/marketing/marketing-shell");

  return (
    <MarketingShell>
      <Hero />
      <Features />
      <LivePreview />
      <HowItWorks />
      <BlogPreview />
      <Cta />
    </MarketingShell>
  );
}
