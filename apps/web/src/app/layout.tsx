import type { Metadata } from "next";
import "../styles/globals.css";
import { AppProviders } from "@/components/providers";

export const metadata: Metadata = {
  title: "VERCODE",
  description: "AI code-review dashboard",
};

// The root layout is the shell root (the sidebar + main canvas). Every
// destination lives under the org scope; the /signin page is the public
// surface (a separate marketing surface per DESIGN_SYSTEM §7) but the
// dashboard MVP lands here with the session already set.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme="dark" is rendered server-side so the single dark palette
    // (globals.css :root) is painted from the first byte — no light flash.
    <html lang="en" data-theme="dark">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
