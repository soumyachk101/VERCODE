import { redirect } from "next/navigation";

// /login — a convenience alias for the sign-in surface. The app has no
// standalone /login route; the sign-in page lives at /signin
// (INFORMATION_ARCHITECTURE §3: first sign-in lands on /overview).
export default function LoginPage() {
  redirect("/signin");
}
