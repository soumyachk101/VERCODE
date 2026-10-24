import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Hero } from "@/components/marketing/landing/hero";
import { Features } from "@/components/marketing/landing/features";
import { LivePreview } from "@/components/marketing/landing/live-preview";
import { HowItWorks } from "@/components/marketing/landing/how-it-works";
import { BlogPreview } from "@/components/marketing/landing/blog-preview";
import { Cta } from "@/components/marketing/cta";

// / — two branches:
//   no session  → the marketing landing page. The section order is the
//                 narrative: hero (what it is) → how it works (the three
//                 steps) → capabilities → live preview (the product, in
//                 your org's own numbers) → blog → the closing CTA band.
//   session + a resolved org → /overview (INFORMATION_ARCHITECTURE §3: the
//                 dashboard first, not a KPI wall, for a signed-in user).
//
// The session check reads the /auth/me endpoint server-side. The cookie
// must be forwarded explicitly — Next.js strips request cookies on
// server-side fetch in some configurations, so the cookie is read from
// the incoming request and re-attached.
//
// If the API is unreachable the server check fails open to the marketing
// page: a landing page that requires a healthy API is not a landing page.
//
// A signed-in user with no org yet (fresh account) stays on the landing
// page; the "Sign in" link in the nav carries them to /signin, which
// routes to the org-creation step.

export const dynamic = "force-dynamic";

async function getOrgId(): Promise<string | null> {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
    const h = await headers();
    const cookie = h.get("cookie") ?? "";

    const res = await fetch(`${apiBase}/api/v1/auth/me`, {
      cache: "no-store",
      redirect: "manual",
      headers: cookie ? { cookie } : undefined,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { orgs?: Array<{ id: string }> };
    return data.orgs?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export default async function Home() {
  const orgId = await getOrgId();
  if (orgId) redirect("/overview");

  return (
    <MarketingShell>
      <Hero />
      <HowItWorks />
      <Features />
      <LivePreview />
      <BlogPreview />
      <Cta />
    </MarketingShell>
  );
}
