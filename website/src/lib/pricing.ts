/**
 * VERCODE website — pricing data: a typed, zod-validated read of
 * content/pricing/pricing.json + the machine-readable quota table.
 *
 * The JSON import is direct (tsconfig has resolveJsonModule on): it gets
 * tree-shaken into the static export and needs no Node APIs at runtime.
 */
import { z } from "zod";

// The Plan union is imported from the shared contracts package: it must stay
// byte-identical to packages/contracts/src/plans.ts (the single source of
// truth for plan names across the monorepo).
import type { Plan as ContractsPlan } from "@vercode/contracts/plans";

// The source file is committed to the repo and read at build time only.
import pricingJson from "../../content/pricing/pricing.json";

export type Plan = ContractsPlan;

// ---------------------------------------------------------------------------
// The JSON schema — mirrors content/pricing/pricing.json exactly.
// ---------------------------------------------------------------------------

const OfferSchema = z.object({
  plan: z.string(),
  price: z.string(),
  priceCurrency: z.string(),
  priceUnit: z.string(),
  positioning: z.string(),
  cta: z.string(),
});

export const PricingJSONSchema = z.object({
  asOf: z.string(),
  offers: z.array(OfferSchema),
});

export type PricingJSON = z.infer<typeof PricingJSONSchema>;

/** The parsed + validated pricing data (from the JSON file on disk). */
export const PRICING: PricingJSON = PricingJSONSchema.parse(pricingJson);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a single plan's offer by its string name. */
export function planOffer(plan: Plan): PricingJSON["offers"][number] {
  const offer = PRICING.offers.find((o) => o.plan === plan);
  if (!offer) throw new Error(`Unknown plan: ${String(plan)}`);
  return offer;
}

/**
 * Render an offer's display price + per-unit label.
 * "0" → "$0", "24" → "$24", "199" → "$199", "custom" → "Custom".
 */
export function formatPrice(offer: PricingJSON["offers"][number]): string {
  const label = offer.priceUnit ?? "";
  const pricePart =
    offer.price === "custom"
      ? "Custom"
      : offer.price === "0"
        ? "$0"
        : `$${offer.price}`;
  return label ? `${pricePart} ${label}` : pricePart;
}

// ---------------------------------------------------------------------------
// The machine-readable quota table for /pricing.
//
// Values MUST match packages/contracts/src/plans.ts (PlanQuota records).
// The display strings are hardcoded here so the static export carries no
// dependency on the contracts package at runtime; the path is the
// source-of-truth check target.
// ---------------------------------------------------------------------------

export type QuotaRowKey =
  | "reviewsPerMonth"
  | "filesPerReview"
  | "concurrent"
  | "retention"
  | "customRules"
  | "modelAccess";

export interface QuotaRow {
  label: string;
  free: string;
  developer: string;
  team: string;
  enterprise: string;
}

export const QUOTA_ROWS: readonly QuotaRow[] = [
  {
    label: "Reviews/month",
    free: "50",
    developer: "500",
    team: "5,000",
    enterprise: "Configured",
  },
  {
    label: "Files/review",
    free: "20",
    developer: "60",
    team: "100",
    enterprise: "Configured",
  },
  {
    label: "Concurrent",
    free: "1",
    developer: "3",
    team: "10",
    enterprise: "Configured",
  },
  {
    label: "Retention",
    free: "30d",
    developer: "90d",
    team: "1y",
    enterprise: "Custom",
  },
  {
    label: "Custom rules",
    free: "3",
    developer: "10",
    team: "50",
    enterprise: "Custom",
  },
  {
    label: "Model access",
    free: "Standard",
    developer: "Standard",
    team: "Standard + Strong",
    enterprise: "Any (BYOK + Ollama)",
  },
];
