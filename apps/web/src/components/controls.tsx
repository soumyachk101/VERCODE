import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TogglePrimitive from "@radix-ui/react-toggle";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("vc-input", className)}
      style={{
        height: 38,
        padding: "0 10px",
        border: "1px solid var(--control)",
        borderRadius: "var(--radius-control)",
        background: "var(--surface)",
        color: "var(--text)",
        fontSize: 14,
        width: "100%",
        outline: "none",
      }}
      {...rest}
    />
  );
}

export function Label({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="label"
      style={{ fontWeight: 500, color: "var(--text)", display: "block", marginBottom: 6 }}
    >
      {children}
    </label>
  );
}

/** A 32–40px range control (the confidence floor slider). */
export function VcSlider({
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.05,
  label,
}: {
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  return (
    <SliderPrimitive.Root
      className="w-full"
      style={{ height: 40, display: "flex", alignItems: "center" }}
      value={[value]}
      onValueChange={(v) => onValueChange(v[0])}
      min={min}
      max={max}
      step={step}
      aria-label={label}
    >
      <SliderPrimitive.Track
        style={{
          position: "relative",
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: "var(--control)",
        }}
      >
        <SliderPrimitive.Range
          style={{
            position: "absolute",
            height: 4,
            borderRadius: 2,
            background: "var(--primary)",
          }}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          background: "var(--primary)",
          border: "2px solid var(--surface)",
          outlineOffset: 2,
        }}
        aria-label={label}
      />
    </SliderPrimitive.Root>
  );
}

/**
 * The toggle (28px wide): the on-colour is the semantic near-black primary,
 * never the brand accent (COMPONENT_CATALOG §3).
 */
export function VcSwitch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? "var(--primary)" : "var(--control)",
        position: "relative",
        flexShrink: 0,
        transition: "background-color 160ms ease-out",
      }}
    >
      <SwitchPrimitive.Thumb
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          background: "var(--surface)",
          boxShadow: "0 1px 2px rgba(0,0,0,.25)",
        }}
      />
    </SwitchPrimitive.Root>
  );
}

/** Underline tabs for metric-switching ("reviews / cost" on the Usage screen). */
export function VcTabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-4" style={{ borderBottom: "1px solid var(--border)" }}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            type="button"
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const idx = tabs.findIndex((x) => x.id === active);
              if (e.key === "ArrowRight") {
                const next = tabs[(idx + 1) % tabs.length];
                onChange(next.id);
                requestAnimationFrame(() => {
                  const el = document.querySelector(`[role="tab"][aria-selected="true"]`);
                  (el as HTMLButtonElement | null)?.focus();
                });
              } else if (e.key === "ArrowLeft") {
                const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
                onChange(prev.id);
                requestAnimationFrame(() => {
                  const el = document.querySelector(`[role="tab"][aria-selected="true"]`);
                  (el as HTMLButtonElement | null)?.focus();
                });
              }
            }}
            className="pressable"
            style={{
              padding: "8px 2px",
              fontSize: 13,
              fontWeight: 500,
              color: on ? "var(--text)" : "var(--muted-ink)",
              borderBottom: on ? "2px solid var(--accent)" : "2px solid transparent",
              margin: "0 0 -1px",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function VcToggle({
  pressed,
  onPressedChange,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed: boolean;
  onPressedChange: (v: boolean) => void;
}) {
  return (
    <TogglePrimitive.Root
      pressed={pressed}
      onPressedChange={onPressedChange}
      style={{
        padding: "4px 10px",
        height: 28,
        borderRadius: "var(--radius-control)",
        border: "1px solid " + (pressed ? "var(--control)" : "transparent"),
        background: pressed ? "var(--active)" : "transparent",
        color: pressed ? "var(--text)" : "var(--muted-ink)",
        fontSize: 13,
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      {...rest}
    >
      {children}
    </TogglePrimitive.Root>
  );
}

/** A 30–36px search input with a leading icon slot. */
export function Search({
  placeholder,
  value,
  onSearch,
  ...rest
}: {
  placeholder: string;
  value: string;
  onSearch: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "placeholder">) {
  return (
    <div style={{ position: "relative" }}>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--faint)",
          fontSize: 14,
        }}
      >
        ⌕
      </span>
      <Input
        {...rest}
        value={value}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{
          height: 34,
          paddingLeft: 30,
          ...(rest.style ?? {}),
        }}
      />
    </div>
  );
}
