import { SigninClient } from "./signin-client";

// /signin — the public surface (DESIGN_SYSTEM §7's "marketing/landing
// surface, the page rules not the app rules"): a live type-set verdict
// as the one large thing, a single sign-in form. This is a separate
// surface from the dashboard — the tokens stay shared, but the rules are
// the page rules. The MVP keeps this minimal: email + password + a
// "create account" link (the auth routes are on the API, cookie-session).
export const dynamic = "force-dynamic";

export default function SigninPage() {
  return <SigninClient />;
}
