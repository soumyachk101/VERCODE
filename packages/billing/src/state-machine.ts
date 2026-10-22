// The authoritative plan state machine (BILLING_SPECIFICATION §2, AC-403,
// THREAT_MODEL T-14).
//
// The rule: ONLY a verified provider event moves this machine. A client claim
// ("I'm on Team") is INERT (AC-403, §2 "a client claim is inert"); a forged /
// unsigned event is rejected + audited (a `BILLING_REJECTED`, no state
// change). The event → state mapping is §4 ("the authoritative inputs").
//
// The machine is pure: it takes a snapshot of the org_billing state + a
// verified event (or a grace-expiry fact) and returns the new state. It never
// trusts a `plan` field in a request body — the plan that lands on a paid
// event is the provider's, not the caller's.

import type { Plan } from "@vercode/contracts";

// ---------------------------------------------------------------------------
// The states (the authoritative ones, the `org_billing.status` enum)
// ---------------------------------------------------------------------------

export type BillingStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "PAUSED";

export interface OrgBillingState {
  status: BillingStatus;
  /** The provider-confirmed plan (what the last verified event set). */
  plan: Plan;
  /** The current period end (a renewal advances it; a downgrade applies at it). */
  currentPeriodEnd: string | null; // an ISO-8601 datetime
  /** The grace window (an invoice.payment_failed starts it; a period-end cancel exits it). */
  graceUntil: string | null; // an ISO-8601 datetime
}

/** The default grace window (a 3-day grace, the operator-tunable value; the test seam overrides it). */
export const DEFAULT_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// The verified events (the §4 mapping, "the authoritative inputs")
// ---------------------------------------------------------------------------

/** A provider-verified event (a decoded + signature-checked webhook payload). */
export interface VerifiedBillingEvent {
  /** The provider event type (`checkout.session.completed`, …). */
  type: string;
  /** The provider event id (the `billing_events (provider, provider_event_id)` UK). */
  providerEventId: string;
  /** The provider (the `billing_events.provider` half of the UK). */
  provider: string;
  /** The plan the event carries (a `subscription.updated` / `invoice.paid` plan). */
  plan?: Plan;
  /** The period end the event advances to (a renewal / a plan change). */
  currentPeriodEnd?: string | null;
  /** The receipt the adapter decoded (an adapter-specific detail, opaque here). */
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Idempotency + client-claim-inert (the §3 rule, IT-payment-03)
// ---------------------------------------------------------------------------

/**
 * The dedup gate (the `billing_events (provider, provider_event_id)` UK): a
 * re-delivered event (a same event id) is a NO-OP (a 200, the state is not
 * double-moved).
 */
export interface EventDedup {
  seen(provider: string, providerEventId: string): boolean;
  record(provider: string, providerEventId: string, type: string): void;
}

export class InMemoryEventDedup implements EventDedup {
  private readonly _seen = new Set<string>();
  key(provider: string, providerEventId: string): string {
    return `${provider}\u0000${providerEventId}`;
  }
  seen(provider: string, providerEventId: string): boolean {
    return this._seen.has(this.key(provider, providerEventId));
  }
  record(provider: string, providerEventId: string, type: string): void {
    this._seen.add(this.key(provider, providerEventId));
    void type; // the type is recorded for the audit row; the key is (provider, id)
  }
}

// ---------------------------------------------------------------------------
// The machine (a pure reducer over verified events)
// ---------------------------------------------------------------------------

export interface MachineInput {
  state: OrgBillingState;
  /** The verified event (a replay already passed the dedup gate; a forged event never reaches here). */
  event: VerifiedBillingEvent;
  /** The clock (inject it for the grace tests; a `now` ISO-8601). */
  now?: string;
  /** The grace window (a override of DEFAULT_GRACE_PERIOD_MS). */
  gracePeriodMs?: number;
}

export interface MachineResult {
  state: OrgBillingState;
  /** The state moved? (a replay that's already recorded = no move, a handled fact). */
  moved: boolean;
  /** A the customer-visible note (a NFR-18 "never silent" — the skip-with-notice text). */
  notice?: string;
}

/**
 * Apply a verified event to the state (the §4 mapping):
 * - `checkout.session.completed` / `invoice.paid` → ACTIVE (or a plan change on ACTIVE); plan + period end set.
 * - `customer.subscription.updated` → a plan / period update (a downgrade applies at period end — not retroactive).
 * - `invoice.payment_failed` → PAST_DUE (the grace: reviews still run; the grace window starts).
 * - `customer.subscription.deleted` → CANCELED (or PAST_DUE → CANCELED on a grace expiry).
 * - `invoice.finalized` → no state move (an invoice-row fetch, stored elsewhere).
 *
 * A client claim ("plan=enterprise" in a request body) NEVER reaches this
 * function (AC-403 "a client claim is inert" — only a verified event does).
 */
export function applyEvent(input: MachineInput): MachineResult {
  const { state, event } = input;
  const graceMs = input.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
  const nowMs = input.now ? Date.parse(input.now) : Date.now();
  const graceUntil = (baseMs: number): string => new Date(baseMs + graceMs).toISOString();

  switch (event.type) {
    case "checkout.session.completed":
    case "invoice.paid": {
      // TRIALING → ACTIVE (or a plan change on ACTIVE, §4 row 1).
      const plan: Plan = event.plan ?? state.plan;
      return {
        state: {
          status: "ACTIVE",
          plan,
          currentPeriodEnd: event.currentPeriodEnd ?? state.currentPeriodEnd,
          graceUntil: null,
        },
        moved: state.status !== "ACTIVE" || state.plan !== plan,
      };
    }

    case "customer.subscription.updated": {
      // A plan / period update (a downgrade applies at period end — not
      // retroactive, §4 row 2 / RATE_LIMITING §4 "a plan change takes
      // effect on the next window").
      const plan: Plan = event.plan ?? state.plan;
      return {
        state: {
          status: state.status, // a plan change does NOT clear a PAST_DUE (the payment state stands)
          plan,
          currentPeriodEnd: event.currentPeriodEnd ?? state.currentPeriodEnd,
          graceUntil: state.graceUntil,
        },
        moved: state.plan !== plan,
        notice:
          plan !== state.plan
            ? "Your plan changed; the new quota applies at the period end."
            : undefined,
      };
    }

    case "invoice.payment_failed": {
      // ACTIVE → PAST_DUE (the grace: the org keeps its plan, reviews still
      // run, a warning surfaces — §4 row 3 / NFR-18 "a billing failure is a
      // degradation, not a revoke").
      if (state.status === "CANCELED") {
        // A canceled sub that gets a payment failure is a re-subscribe-in-progress — a no-move (the event is recorded, the state stands).
        return { state, moved: false };
      }
      return {
        state: {
          status: "PAST_DUE",
          plan: state.plan,
          currentPeriodEnd: state.currentPeriodEnd,
          graceUntil: state.graceUntil ?? graceUntil(nowMs),
        },
        moved: state.status !== "PAST_DUE",
        notice: "Your payment failed. Reviews continue for the grace period.",
      };
    }

    case "customer.subscription.deleted": {
      // CANCELED (or PAST_DUE → CANCELED on a grace expiry, §4 row 4). The
      // quota freezes; new reviews skip with a posted notice (NFR-18 "never
      // a silent stop").
      if (state.status === "CANCELED") return { state, moved: false };
      return {
        state: {
          status: "CANCELED",
          plan: state.plan,
          currentPeriodEnd: state.currentPeriodEnd,
          graceUntil: null,
        },
        moved: true,
        notice: "Your plan was canceled. New reviews are skipped. Re-subscribe to resume.",
      };
    }

    case "invoice.finalized": {
      // No state move — a the invoice-row fetch (the billing page's invoice
      // list, §4 row 5). The machine records the receipt (the dedup gate
      // saw it) but the org_billing state stands.
      return { state, moved: false };
    }

    default: {
      // A unknown verified event type (a forward-compat provider event) is
      // recorded (the dedup gate saw it) but does NOT move the state — a
      // state move is only on a known §4 event.
      return { state, moved: false };
    }
  }
}

// ---------------------------------------------------------------------------
// The grace invariant (NFR-18 "a past_due org keeps running through the
// grace; after grace, the quota freezes + new reviews skip-with-notice")
// ---------------------------------------------------------------------------

export interface GraceCheck {
  state: OrgBillingState;
  /** The clock (a ISO-8601 now). */
  now: string;
}

/**
 * Does a PAST_DUE org still run reviews (in the grace), or is the grace
 * over (→ CANCELED, the quota freezes, new reviews skip-with-notice)?
 *
 * The invariant (BILLING_SPECIFICATION §4 / §8 "a billing failure is a
 * degradation (a grace), not a revoke (a cancellation)"):
 * - PAST_DUE + within the grace window → reviews still run (a warning surfaces).
 * - PAST_DUE + grace expired → CANCELED (a the `customer.subscription.deleted`
 *   event at period end is the mover; this check is the *pre-flight* read —
 *   the worker's skip-with-notice gate).
 */
export function graceStatus(check: GraceCheck): { inGrace: boolean; canceled: boolean; notice?: string } {
  if (check.state.status !== "PAST_DUE") {
    // Not past-due: no grace concern (a ACTIVE org runs; a CANCELED org already skipped).
    return { inGrace: false, canceled: check.state.status === "CANCELED" };
  }
  const graceUntilMs = check.state.graceUntil ? Date.parse(check.state.graceUntil) : null;
  if (graceUntilMs === null) {
    // PAST_DUE with no grace window set (a migration edge) → treat as in-grace (the degradation, not a revoke, NFR-18).
    return { inGrace: true, canceled: false, notice: "Your payment failed. Reviews continue for the grace period." };
  }
  if (Date.parse(check.now) < graceUntilMs) {
    return { inGrace: true, canceled: false, notice: "Your payment failed. Reviews continue for the grace period." };
  }
  // The grace is over (a the `customer.subscription.deleted` at period end
  // lands the CANCELED; this pre-flight read signals the skip-with-notice).
  return {
    inGrace: false,
    canceled: true,
    notice: "Your plan was canceled. New reviews are skipped. Re-subscribe to resume.",
  };
}

// ---------------------------------------------------------------------------
// The client-claim-inert gate (AC-403 "a client claim is inert")
// ---------------------------------------------------------------------------

/**
 * A "client claim" (a "plan=enterprise" in a request body) MUST NOT move
 * the state (AC-403, THREAT_MODEL T-14 "the authoritative-state rule").
 *
 * The gate: the only state mover is `applyEvent` (a verified event). A
 * client-claim input is recorded as a "pending" flag (a the dashboard's
 * "Upgrading…" state, §2 "an 'Upgrading…' state persists until the webhook
 * confirms it") — the provider-confirmed state stands until a verified
 * webhook arrives.
 */
export interface ClientClaim {
  /** The claimed plan (a inert — it does NOT land on `state.plan`). */
  claimedPlan: Plan;
}

export interface PendingTransition {
  /** The dashboard's "Upgrading…" flag (a persisted, a the webhook confirms it). */
  pending: boolean;
  claimedPlan: Plan;
}

/**
 * Record a client claim (an inert + an "Upgrading…" pending state, §2 "a
 * client claim is inert; the dashboard shows the provider-confirmed state,
 * with an 'Upgrading…' pending state until the webhook confirms it").
 *
 * The state itself is UNCHANGED (a `state` is returned as-is); the pending
 * flag is the surface (the webhook clears it).
 */
export function recordClientClaim(
  state: OrgBillingState,
  claim: ClientClaim
): { state: OrgBillingState; pending: PendingTransition } {
  // The state is UNCHANGED (a the client claim is INERT, AC-403).
  return { state, pending: { pending: true, claimedPlan: claim.claimedPlan } };
}

/** Clear the pending flag (a the verified webhook confirmed the transition). */
export function clearPending(
  state: OrgBillingState,
  event: VerifiedBillingEvent
): { state: OrgBillingState; cleared: boolean } {
  const result = applyEvent({ state, event });
  return { state: result.state, cleared: true };
}
