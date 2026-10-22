"use client";

// The sign-in screen (DESIGN_SYSTEM §7 — the page rules, not the app
// rules): the review verdict as the hero device, a live type-set
// "Needs changes · 2 high" line as the one large thing. No gradient, no
// eyebrow label, no feature cards; one form, one primary.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button, TextButton } from "@/components/Button";
import { Input, Label } from "@/components/controls";

export function SigninClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.post("/auth/signin", { email, password });
      router.replace("/overview");
    } catch (e) {
      setErr(
        e instanceof ApiError ? e.message : "Sign in failed — check your email and password.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--ground)",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        fontSize: 14,
      }}
      className="vc-signin"
    >
      {/* the hero: the review verdict, the one large thing on screen */}
      <div
        style={{
          padding: "80px 64px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 16,
              height: 16,
              background: "var(--accent)",
              borderRadius: 4,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ width: 8, height: 8, background: "var(--ground)", borderRadius: 2 }} />
          </span>
          VERCODE
        </div>
        <div
          className="tabular"
          style={{
            fontSize: 40,
            fontWeight: 600,
            color: "var(--text)",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
          }}
        >
          Needs changes
          <span style={{ color: "var(--muted)", fontWeight: 400 }}> · 2 high</span>
        </div>
        <p className="finding-line" style={{ margin: 0, maxWidth: 420 }}>
          Deterministic-first review: static findings land even when the AI stage
          degrades. Every severity is a word, not a colour.
        </p>
      </div>

      {/* the form */}
      <div
        style={{
          padding: "80px 64px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 20,
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 320 }}>
          <h1 className="h1" style={{ margin: 0 }}>
            Sign in
          </h1>
          <p className="finding-line" style={{ margin: 0 }}>
            Your session cookie is set on sign-in and rides every API call.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 }}
        >
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {err && (
            <p role="alert" className="meta" style={{ color: "var(--negative)" }}>
              {err}
            </p>
          )}
          <Button type="submit" disabled={busy || !email || !password} size="lg">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <TextButton onClick={() => router.push("/signin?mode=signup")}>
            Create an account
          </TextButton>
        </form>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .vc-signin { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
