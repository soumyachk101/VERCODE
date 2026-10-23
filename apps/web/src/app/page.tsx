// / — the public marketing landing for VERCODE (no auth / SSO). Composed of
// the landing blocks in components/marketing/landing/ inside the marketing
// shell (header + footer). The dashboard app still lives at /overview and
// friends behind the shell; the sign-in surface is at /signin.
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Hero } from "@/components/marketing/landing/hero";
import { Features } from "@/components/marketing/landing/features";
import { HowItWorks } from "@/components/marketing/landing/how-it-works";
import { BlogPreview } from "@/components/marketing/landing/blog-preview";
import { ChangelogPreview } from "@/components/marketing/landing/changelog-preview";
import { Cta } from "@/components/marketing/cta";

export default function LandingPage() {
  return (
    <MarketingShell>
      <Hero />
      <Features />
      <HowItWorks />
      <BlogPreview />
      <ChangelogPreview />
      <Cta />
    </MarketingShell>
  );
}
