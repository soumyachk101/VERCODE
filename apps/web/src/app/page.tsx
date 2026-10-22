import { redirect } from "next/navigation";

// / → /overview (INFORMATION_ARCHITECTURE §3: the default landing on first
// sign-in is Overview, not a KPI wall).
export default function Home() {
  redirect("/overview");
}
