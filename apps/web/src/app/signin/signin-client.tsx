"use client";

// The sign-in screen (DESIGN_SYSTEM §7 — the page rules, not the app
// rules): the review verdict as the hero device, a live type-set
// "Needs changes · 2 high" line as the one large thing. No gradient, no
// eyebrow label, no feature cards; one form, one primary.
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button, TextButton } from "@/components/Button";
import { Input, Label } from "@/components/controls";

export function SigninClient() {
  const router = useRouter();
  const params = useSearchParams();
  // ?mode=signup switches the same form to a create-account (one
  // field set, the API handles both: /auth/signin + /auth/signup).
  const mode = params.get("mode") === "signup" ? "signup" : "signin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await api.post("/auth/signup", { email, password, name: email.split("@")[0] });
      } else {
        await api.post("/auth/signin", { email, password });
      }
      router.replace("/overview");
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.message
          : mode === "signup"
            ? "Sign up failed — try again."
            : "Sign in failed — check your email and password.",
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
            {mode === "signup" ? "Create an account" : "Sign in"}
          </h1>
          <p className="finding-line" style={{ margin: 0 }}>
            Your session cookie is set on {mode === "signup" ? "sign-up" : "sign-in"} and rides every API call.
          </p>
          {mode === "signin" && <SignupHint onSignup={() => router.push("/signin?mode=signup")} />}
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
            <Label htmlFor="password">{mode === "signup" ? "Password (min 8 characters)" : "Password"}</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {err && (
            <p role="alert" className="meta" style={{ color: "var(--negative)" }}>
              {err}
            </p>
          )}
          <Button type="submit" disabled={busy || !email || !password || (mode === "signup" && password.length < 8)} size="lg">
            {busy ? (mode === "signup" ? "Creating account…" : "Signing in…") : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
          {mode === "signin" ? (
            <TextButton onClick={() => router.push("/signin?mode=signup")}>
              Create an account
            </TextButton>
          ) : (
            <TextButton onClick={() => router.push("/signin")}>
              Already have an account? Sign in
            </TextButton>
          )}
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

// A dev-only shortcut notice (visible in local runs): a seeded demo
// account when the API is up + Postgres reachable, so the login never
// depends on GitHub SSO.
function SignupHint({ onSignup }: { onSignup: () => void }) {
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    void (async () => {
      try {
        const res = await fetch(`${api.API_BASE}/api/v1/health/readyz`, { cache: "no-store" });
        if (res.ok) setHint("Dev demo login available");
      } catch {
        // a down API shows no hint
      }
    })();
  }, []);
  if (!hint) return null;
  return (
    <p className="meta" style={{ margin: 8, 0, 0, fontSize: 12, color: "var(--muted)" }}>
      {hint} — create an account below, then{" "}
      <button type="button" className="pressable" style={{ color: "var(--accent)", border: 0, background: "none", cursor: "pointer", fontSize: 12 }} onClick={onSignup}>
        sign in with it
      </button>
      .
    </p>
  );
}
