"use client";

// The sign-in screen (DESIGN_SYSTEM §7 — the page rules, not the app
// rules): the review verdict as the hero device, a live type-set
// "Needs changes · 2 high" line as the one large thing. No gradient, no
// eyebrow label, no feature cards; one form, one primary.
//
// The local login path: email + password against the API's cookie session
// (POST /auth/signin, or /auth/signup via ?mode=signup) — no SSO (GitHub
// SSO does not exist in local dev, so this surface is the way in). A
// session that already exists on load is detected and the user is sent
// straight to the dashboard, so the shell never loops back to sign-in. A
// fresh account without an org yet gets a "create your organization"
// step, then every screen lands on /overview.
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button, TextButton } from "@/components/Button";
import { Input, Label } from "@/components/controls";

interface MeResponse {
  user?: { id: string; email: string; name?: string | null };
  orgs?: Array<{ id: string; name: string }>;
}

export function SigninClient() {
  const router = useRouter();
  const params = useSearchParams();
  // ?mode=signup switches the same form to a create-account (one field
  // set, the API handles both: /auth/signin + /auth/signup).
  const mode = params.get("mode") === "signup" ? "signup" : "signin";
  // ?next=/x keeps the post-sign-in redirect (a relative path only).
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/overview";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // "auth" (sign in / sign up) or "org" (a fresh account without an org).
  const [step, setStep] = useState<"auth" | "org">("auth");

  // A session that already exists on load: resolve /auth/me and bounce
  // straight to the dashboard (or to the org step for a fresh account).
  useEffect(() => {
    let live = true;
    api
      .get<MeResponse>("/auth/me")
      .then((me) => {
        if (!live) return;
        if (me.orgs && me.orgs.length > 0) {
          router.replace(next);
        } else {
          setStep("org");
        }
      })
      .catch(() => {
        // no session — the sign-in form is the correct surface.
      });
    return () => {
      live = false;
    };
  }, [mode, next]);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (step === "org") {
        await api.post<{ org: { id: string } }>("/orgs", { name: orgName.trim() });
        router.replace(next);
        return;
      }
      if (mode === "signup") {
        await api.post("/auth/signup", {
          email,
          password,
          name: name.trim() || email.split("@")[0],
        });
      } else {
        await api.post("/auth/signin", { email, password });
      }
      // The sign-in/sign-up response has no orgs — resolve the session's
      // orgs from /auth/me and land on the dashboard or the org step.
      const me = await api.get<MeResponse>("/auth/me").catch(() => null);
      if (me?.orgs && me.orgs.length > 0) {
        router.replace(next);
      } else {
        setStep("org");
      }
    } catch (e) {
      setErr(friendly(e, mode === "signup" && step === "auth"));
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
              background: "hsl(var(--accent))",
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
          <span style={{ color: "var(--muted-ink)", fontWeight: 400 }}> · 2 high</span>
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
          borderLeft: "1px solid hsl(var(--border))",
        }}
      >
        {step === "org" ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 320 }}>
              <h1 className="h1" style={{ margin: 0 }}>
                Create your organization
              </h1>
              <p className="finding-line" style={{ margin: 0 }}>
                {email || "Your account"} has no organization yet — one is required
                to hold reviews.
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
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="acme"
                />
              </div>
              {err && (
                <p role="alert" className="meta" style={{ color: "var(--negative)" }}>
                  {err}
                </p>
              )}
              <Button type="submit" disabled={busy || orgName.trim().length < 2} size="lg">
                {busy ? "Creating…" : "Create organization"}
              </Button>
              <TextButton onClick={() => setStep("auth")}>Back to sign in</TextButton>
            </form>
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 320 }}>
              <h1 className="h1" style={{ margin: 0 }}>
                {mode === "signup" ? "Create an account" : "Sign in"}
              </h1>
              <p className="finding-line" style={{ margin: 0 }}>
                Your session cookie is set on {mode === "signup" ? "sign-up" : "sign-in"} and rides
                every API call.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 }}
            >
              {mode === "signup" && (
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
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
                <Label htmlFor="password">
                  {mode === "signup" ? "Password (min 8 characters)" : "Password"}
                </Label>
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
              <Button
                type="submit"
                disabled={
                  busy || !email || !password || (mode === "signup" && password.length < 8)
                }
                size="lg"
              >
                {busy
                  ? mode === "signup"
                    ? "Creating account…"
                    : "Signing in…"
                  : mode === "signup"
                    ? "Create account"
                    : "Sign in"}
              </Button>
              <TextButton
                onClick={() => router.push(mode === "signup" ? "/signin" : "/signin?mode=signup")}
              >
                {mode === "signup" ? "Already have an account? Sign in" : "Create an account"}
              </TextButton>
            </form>
          </>
        )}
      </div>
      <style>{`
        @media (max-width: 900px) {
          .vc-signin { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function friendly(e: unknown, signup: boolean): string {
  if (!(e instanceof ApiError)) {
    return signup
      ? "Sign up failed — try again."
      : "Sign in failed — check your email and password.";
  }
  if (e.code === "EMAIL_TAKEN") return "That email already has an account — sign in instead.";
  if (e.code === "UNAUTHENTICATED")
    return "Invalid credentials — check your email and password.";
  if (e.code === "ACCOUNT_LOCKED") return "Too many attempts. Try later.";
  if (e.code === "SLUG_TAKEN") return "That organization name is already in use — pick another.";
  if (e.code === "VALIDATION_ERROR") return e.message || "Invalid request.";
  if (e.message && e.message.length > 0) return e.message;
  return "Something went wrong.";
}
