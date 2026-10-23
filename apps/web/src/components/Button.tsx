import { cn, buttonVariants } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "default" | "lg";
}

/**
 * Button (COMPONENT_CATALOG §1): 32px, 6px radius, one filled primary per
 * screen; :active scale(0.97) via the .pressable class (DESIGN_SYSTEM §8).
 */
export function Button({ variant, size, className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    />
  );
}

/** A text-link styled as a button (a "View all" / "Retry" action). */
export function TextButton({
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: never }) {
  return (
    <button
      type="button"
      className={cn(
        "pressable text-sm font-medium text-[var(--muted-ink)] hover:text-[var(--text)] underline underline-offset-4 decoration-[var(--control)]",
        className,
      )}
      {...rest}
    />
  );
}
