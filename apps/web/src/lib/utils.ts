import { clsx, type ClassValue } from "clsx";
import { cva, type VariantProps } from "class-variance-authority";

export { clsx };
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const buttonVariants = cva(
  "pressable inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium text-sm select-none focus-visible:outline-2 focus-visible:outline-[var(--control)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-[var(--primary-ink)]",
        secondary:
          "bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]",
        ghost: "text-[var(--muted-ink)] hover:text-[var(--text)]",
        destructive:
          "bg-[var(--surface)] border border-[var(--negative)] text-[var(--negative)]",
      },
      size: {
        default: "h-8 px-3 rounded-[6px]",
        sm: "h-7 px-2.5 rounded-[6px] text-[13px]",
        lg: "h-10 px-4 rounded-[6px] text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

/** Thousands-separated integer (tabular figures, right-aligned numbers). */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.trunc(n));
}
