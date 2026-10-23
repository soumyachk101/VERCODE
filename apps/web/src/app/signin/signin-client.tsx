"use client";

// The sign-in screen (DESIGN_SYSTEM §7 — the page rules, not the app
// rules): the review verdict as the hero device, a live type-set
// "Needs changes · 2 high" line as the one large thing. No gradient, no
// eyebrow label, no feature cards; one form, one primary.
//
// The local login path: email + password against the API's cookie session
// (POST /auth/signin or /auth/signup; a seeded local user in dev). No SSO —
// GitHub SSO does not exist in local dev, so this surface is the only
// way in. After sign-in, a fresh account without an org gets a "create
// your organization" step, then every screen lands on /overview.
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
  // ?mode=signup flips the form to the "create an account" mode (the
  // pre-existing link); ?next=/x keeps the post-sign-in redirect.
  const signup = params.get("mode") === "signup";
  const next = (params.get("next") ?? "").startsWith("/") ? params.get("next")! : "/overview";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [step, setStep] = useState<"auth" | "org">(() => (signup ? "auth" : "auth"));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A session that already exists on load: resolve /auth/me and bounce
  // straight to the dashboard so the shell never loops back to sign-in.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<MeResponse>("/auth/me")
      .then((me) => {
        if (!live) return;
        if (me.orgs && me.orgs.length > 0) {
          router.replace(next);
        } else {
          // a session without an org yet (a fresh account) — stay on the
          // page and offer the org-creation step.
          setStep("org");
          setRestored(true);
        }
      })
      .catch(() => {
        // no session — the sign-in form is the correct surface.
      })
      .finally(() => {
        if (live) setRestored(true);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const afterAuth = async (res: MeResponse | null) => {
    if (res?.orgs && res.orgs.length > 0) {
      router.replace(next);
      return;
    }
    setStep("org");
  };

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (step === "auth") {
        const res = signup
          ? await api.post<MeResponse>(
              "/auth/signup",
              name ? { email, password, name: name.trim() } : { email, password },
            )
          : await api.post<MeResponse>("/auth/signin", { email, password });
        // /auth/signin|signup return { user } without orgs — resolve the
        // session's orgs from /auth/me before deciding where to land.
        const me = await api.get<MeResponse>("/auth/me").catch(() => res);
        if (me.orgs && me.orgs.length > 0) {
          router.replace(next);
        } else {
          setStep("org");
        }
      } else {
        const created = await api.post<{ org: { id: string } }>("/orgs", {
          name: orgName.trim(),
        });
        await afterAuth({ orgs: [{ id: created.org.id, name: orgName }] });
      }
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? friendly(e.code, e.message)
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
        {restored && step === "org" ? (
          <OrgForm
            email={email}
            busy={busy}
            err={err}
            onBusy={(b) => {
              setBusy(b);
            }}
            onSubmit={async () => {
              setErr(null);
              setBusy(true);
              try {
                const created = await api.post<{ org: { id: string } }>("/orgs", {
                  name: orgName.trim(),
                });
                await afterAuth({ orgs: [{ id: created.org.id, name: orgName }] });
              } catch (e) {
                setErr(
                  e instanceof ApiError
                    ? friendly(e.code, e.message)
                    : "Something went wrong creating your organization.",
                );
              } finally {
                setBusy(false);
              }
            }}
            orgName={orgName}
            onOrgName={(v) => setOrgName(v)}
          />
        ) : step === "auth" ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 320 }}>
              <h1 className="h1" style={{ margin: 0 }}>
                {signup ? "Create an account" : "Sign in"}
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
              {signup && (
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
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={signup ? "new-password" : "current-password"}
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
                disabled={busy || !email || !password || (signup ? false : false)}
                size="lg"
              >
                {busy ? "Signing in…" : signup ? "Create account" : "Sign in"}
              </Button>
              <TextButton
                onClick={() => router.push(signup ? "/signin" : "/signin?mode=signup")}
              >
                {signup ? "I already have an account" : "Create an account"}
              </TextButton>
            </form>
          </>
        ) : null}
      </div>
      <style>{`
        @media (max-width: 900px) {
          .vc-signin { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The org-creation step (a fresh account, a session without an org).
// ---------------------------------------------------------------------------
function OrgForm({
  email,
  orgName,
  onOrgName,
  err,
  busy,
  onBusy,
  onSubmit,
}: {
  email: string;
  orgName: string;
  onOrgName: (v: string) => void;
  err: string | null;
  busy: boolean;
  onBusy: (b: boolean) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 320 }}>
        <h1 className="h1" style={{ margin: 0 }}>
          Create your organization
        </h1>
        <p className="finding-line" style={{ margin: 0 }}>
          {email || "Your account"} needs one organization to hold reviews.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onBusy(true);
          void onSubmit().finally(() => onBusy(false));
        }}
        style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 }}
      >
        <div>
          <Label htmlFor="org-name">Organization name</Label>
          <Input
            id="org-name"
            value={orgName}
            onChange={(e) => onOrgName(e.target.value)}
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
      </form>
    </>
  );
}

function friendly(code: string, message: string): string {
  if (code === "EMAIL_TAKEN") return "That email already has an account — sign in instead.";
  if (code === "UNAUTHENTICATED") return "Invalid credentials — check your email and password.";
  if (code === "ACCOUNT_LOCKED") return "Too many attempts. Try later.";
  if (code === "SLUG_TAKEN") return "That organization name is already in use — pick another.";
  if (message && message.length > 0) return message;
  return "Something went wrong.";
}
