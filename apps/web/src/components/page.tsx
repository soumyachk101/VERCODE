import type { HTMLAttributes, ReactNode } from "react";
import { OrgShell } from "./OrgShell";

export function Page({ children, className }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

/**
 * A page root that puts the whole screen inside the org shell (sidebar +
 * live region). Each destination's `page.tsx` is a server component that
 * composes this client shell with its own client data hooks, so the h1,
 * the finding line, and every block stay readable.
 */
export function OrgPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <OrgShell>
      <div className={className}>{children}</div>
    </OrgShell>
  );
}
