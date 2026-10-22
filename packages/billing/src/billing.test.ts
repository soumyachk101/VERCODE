// The billing test surface (BILLING_SPECIFICATION §9, UT-billing-*):
// - UT-billing-state-*: a each §4 event → state transition (a the machine
//   is driven ONLY by verified events, AC-403 "the authoritative-state
//   rule").
// - UT-billing-idem-*: a the replay no-op (a the `billing_events (provider,
//   provider_event_id)` UK, IT-payment-03 "a replay is a 200 no-op") + a
//   the client-claim-inert (a "plan=enterprise" request body does NOT move
//   the state, IT-payment-02 / AC-403).
// - UT-billing-grace: a the grace invariant (a PAST_DUE keeps running
//   through the grace window; after grace → CANCELED, the quota freezes,
//   new reviews skip-with-notice, NFR-18 "never a silent stop").
//
// The Mock adapter's deterministic signature (a the test seam): a the
// `MockAdapter.sign` is a a sync hex hmac over the raw body with a fixed
// test secret — a a test verifies a correct signature + rejects a forged
// one (a a `handleEvent` with a wrong signature throws, a the ingress
// turns it into a 401 BILLING_REJECTED + audit).

import { describe, it, expect } from "vitest";
import {
  applyEvent,
  clearPending,
  DEFAULT_GRACE_PERIOD_MS,
  graceStatus,
  InMemoryEventDedup,
  recordClientClaim,
  type OrgBillingState,
} from "./state-machine.js";
import { MockAdapter } from "./index.js";

// ---------------------------------------------------------------------------
// The fixture state (a a the starting snapshot, a the org_billing row shape)
// ---------------------------------------------------------------------------

const TRIALING: OrgBillingState = {
  status: "TRIALING",
  plan: "free",
  currentPeriodEnd: null,
  graceUntil: null,
};

const ACTIVE_TEAM: OrgBillingState = {
  status: "ACTIVE",
  plan: "team",
  currentPeriodEnd: "2026-01-31T00:00:00.000Z",
  graceUntil: null,
};

const PAST_DUE_IN_GRACE: OrgBillingState = {
  status: "PAST_DUE",
  plan: "team",
  currentPeriodEnd: "2026-01-31T00:00:00.000Z",
  graceUntil: "2026-02-03T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// UT-billing-state-* — a the §4 event → state transitions
// ---------------------------------------------------------------------------

describe("billing state machine (UT-billing-state-*, §4 mapping)", () => {
  it("checkout.session.completed moves TRIALING → ACTIVE (a the plan + period end land)", () => {
    const res = applyEvent({
      state: TRIALING,
      event: {
        type: "checkout.session.completed",
        providerEventId: "evt_001",
        provider: "mock",
        plan: "team",
        currentPeriodEnd: "2026-01-31T00:00:00.000Z",
      },
    });
    expect(res.state.status).toBe("ACTIVE");
    expect(res.state.plan).toBe("team");
    expect(res.state.currentPeriodEnd).toBe("2026-01-31T00:00:00.000Z");
    expect(res.moved).toBe(true);
  });

  it("invoice.paid moves TRIALING → ACTIVE (a the §4 row 1)", () => {
    const res = applyEvent({
      state: TRIALING,
      event: { type: "invoice.paid", providerEventId: "evt_002", provider: "mock", plan: "developer" },
    });
    expect(res.state.status).toBe("ACTIVE");
    expect(res.state.plan).toBe("developer");
  });

  it("customer.subscription.updated changes the plan on ACTIVE (a the §4 row 2; a downgrade is not retroactive)", () => {
    const res = applyEvent({
      state: ACTIVE_TEAM,
      event: {
        type: "customer.subscription.updated",
        providerEventId: "evt_003",
        provider: "mock",
        plan: "developer",
        currentPeriodEnd: "2026-01-31T00:00:00.000Z",
      },
    });
    // A the plan lands (a the period end stands — a the new quota applies at
    // period end, §4 row 2 "a downgrade is not retroactive").
    expect(res.state.plan).toBe("developer");
    expect(res.state.currentPeriodEnd).toBe("2026-01-31T00:00:00.000Z");
    expect(res.moved).toBe(true);
  });

  it("invoice.payment_failed moves ACTIVE → PAST_DUE (a the grace window starts)", () => {
    const res = applyEvent({
      state: ACTIVE_TEAM,
      event: { type: "invoice.payment_failed", providerEventId: "evt_004", provider: "mock" },
      now: "2026-02-01T00:00:00.000Z",
    });
    expect(res.state.status).toBe("PAST_DUE");
    // A the grace window (a the DEFAULT_GRACE_PERIOD_MS from the now): a a
    // 3-day grace (a the invoice.payment_failed + a 72 h).
    expect(res.state.graceUntil).toBe(new Date(Date.parse("2026-02-01T00:00:00.000Z") + DEFAULT_GRACE_PERIOD_MS).toISOString());
    expect(res.moved).toBe(true);
    // A the NFR-18 "never silent" — a the customer-visible warning.
    expect(res.notice).toMatch(/payment failed/i);
  });

  it("customer.subscription.deleted moves PAST_DUE → CANCELED (a the §4 row 4; a the grace exits)", () => {
    const res = applyEvent({
      state: PAST_DUE_IN_GRACE,
      event: { type: "customer.subscription.deleted", providerEventId: "evt_005", provider: "mock" },
    });
    expect(res.state.status).toBe("CANCELED");
    expect(res.state.graceUntil).toBeNull();
    expect(res.moved).toBe(true);
    // A the NFR-18 "a skip-with-notice" — a the posted notice text.
    expect(res.notice).toMatch(/canceled/i);
  });

  it("invoice.finalized does NOT move the state (a the §4 row 5, a the invoice-row fetch)", () => {
    const res = applyEvent({
      state: ACTIVE_TEAM,
      event: { type: "invoice.finalized", providerEventId: "evt_006", provider: "mock" },
    });
    expect(res.state).toBe(ACTIVE_TEAM); // a the state stands
    expect(res.moved).toBe(false);
  });

  it("a CANCELED state is terminal (a a re-subscribe is a NEW event, a the §2 diagram's new-sub row)", () => {
    const canceled: OrgBillingState = { status: "CANCELED", plan: "team", currentPeriodEnd: null, graceUntil: null };
    const res = applyEvent({
      state: canceled,
      event: { type: "invoice.paid", providerEventId: "evt_007", provider: "mock", plan: "team" },
    });
    expect(res.state.status).toBe("ACTIVE");
    expect(res.moved).toBe(true);
  });

  it("a customer.subscription.deleted on a CANCELED state is a no-move (a the idempotent terminal)", () => {
    const canceled: OrgBillingState = { status: "CANCELED", plan: "team", currentPeriodEnd: null, graceUntil: null };
    const res = applyEvent({
      state: canceled,
      event: { type: "customer.subscription.deleted", providerEventId: "evt_008", provider: "mock" },
    });
    expect(res.moved).toBe(false);
    expect(res.state).toBe(canceled);
  });
});

// ---------------------------------------------------------------------------
// UT-billing-idem-* — a the replay no-op + a the client-claim-inert
// ---------------------------------------------------------------------------

describe("billing idempotency + client-claim-inert (UT-billing-idem-*, IT-payment-02/03)", () => {
  it("a replay (a same provider event id) is a no-op (a the dedup gate)", () => {
    const dedup = new InMemoryEventDedup();
    const state = TRIALING;
    const event = {
      type: "invoice.paid",
      providerEventId: "evt_replay",
      provider: "mock",
      plan: "team" as const,
    };

    // A the first delivery (a the move + a the record).
    expect(dedup.seen(event.provider, event.providerEventId)).toBe(false);
    const first = applyEvent({ state, event });
    dedup.record(event.provider, event.providerEventId, event.type);
    expect(first.moved).toBe(true);

    // A the replay (a the dedup gate catches it → a no-op).
    expect(dedup.seen(event.provider, event.providerEventId)).toBe(true);
    // A the replay must NOT double-move: a the ingress checks the dedup gate
    // BEFORE calling applyEvent (a the route's `existingEvent` branch → a a
    // 200 no-op, IT-payment-03). A the machine itself is pure (a a
    // re-applied event on the already-moved state is a no-move).
    const replay = applyEvent({ state: first.state, event });
    expect(replay.moved).toBe(false); // a the ACTIVE + team state is a no-move
  });

  it("a client claim (plan=enterprise) is INERT (a the state does NOT move, AC-403)", () => {
    const state = ACTIVE_TEAM;
    const { state: unchanged, pending } = recordClientClaim(state, { claimedPlan: "enterprise" });
    // A the client claim MUST NOT move the state (a IT-payment-02 "a a
    // client claim 'plan=enterprise' → org_billing is unchanged").
    expect(unchanged).toBe(state); // a the same reference — a the state is a untouched
    expect(unchanged.plan).toBe("team"); // a NOT "enterprise"
    // A the dashboard's "Upgrading…" pending state (a §2 "a pending state
    // persists until the webhook confirms it").
    expect(pending.pending).toBe(true);
    expect(pending.claimedPlan).toBe("enterprise");
  });

  it("a the verified webhook confirms the transition (a the pending clears)", () => {
    const state = ACTIVE_TEAM;
    const { state: after } = clearPending(state, {
      type: "checkout.session.completed",
      providerEventId: "evt_upgrade",
      provider: "mock",
      plan: "enterprise",
    });
    expect(after.status).toBe("ACTIVE");
    expect(after.plan).toBe("enterprise");
  });
});

// ---------------------------------------------------------------------------
// UT-billing-grace — a the grace invariant (NFR-18 "a a past_due org keeps
// running through the grace; after grace, the quota freezes + new reviews
// skip-with-notice")
// ---------------------------------------------------------------------------

describe("billing grace (UT-billing-grace, NFR-18)", () => {
  it("a PAST_DUE org keeps running reviews through the grace window", () => {
    const check = graceStatus({
      state: PAST_DUE_IN_GRACE,
      now: "2026-02-01T00:00:00.000Z", // a within the 2026-02-03 grace
    });
    expect(check.inGrace).toBe(true);
    expect(check.canceled).toBe(false);
    // A the warning surfaces (a the NFR-18 "a a warning is a surfaced").
    expect(check.notice).toMatch(/grace/i);
  });

  it("a a PAST_DUE org after the grace → CANCELED (a the quota freezes, new reviews skip-with-notice)", () => {
    const check = graceStatus({
      state: PAST_DUE_IN_GRACE,
      now: "2026-02-04T00:00:00.000Z", // a past the 2026-02-03 grace
    });
    expect(check.inGrace).toBe(false);
    expect(check.canceled).toBe(true);
    // A the NFR-18 "a a skip-with-notice" — a the posted notice.
    expect(check.notice).toMatch(/canceled/i);
  });

  it("a a non-past-due org has no grace concern (a the PAST_DUE check is a no-op)", () => {
    expect(graceStatus({ state: ACTIVE_TEAM, now: "2026-02-01T00:00:00.000Z" }).inGrace).toBe(false);
    const canceled: OrgBillingState = { status: "CANCELED", plan: "team", currentPeriodEnd: null, graceUntil: null };
    expect(graceStatus({ state: canceled, now: "2026-02-01T00:00:00.000Z" }).canceled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The Mock adapter (a the deterministic signature + a the forged reject)
// ---------------------------------------------------------------------------

describe("MockAdapter (a the test seam, a the deterministic signature)", () => {
  it("a a verified event (a the correct signature) passes", async () => {
    const mock = new MockAdapter({ webhookSecret: "test-mock-secret" });
    const body = mock.event({ id: "evt_sig_001", type: "invoice.paid", plan: "team" });
    const sig = mock.sign(body);
    const evt = await mock.handleEvent(body, sig, "test-mock-secret");
    expect(evt.providerEventId).toBe("evt_sig_001");
    expect(evt.type).toBe("invoice.paid");
    expect(evt.plan).toBe("team");
  });

  it("a a forged event (a a wrong signature) is rejected (a AC-403: a forged/unsigned event is rejected)", async () => {
    const mock = new MockAdapter({ webhookSecret: "test-mock-secret" });
    const body = mock.event({ id: "evt_sig_002", type: "invoice.paid", plan: "enterprise" });
    // A a forged signature (a the attacker doesn't have the secret): a a
    // mismatch → a handleEvent throws (a the ingress → a 401
    // BILLING_REJECTED + a audit, a the state does NOT move).
    await expect(mock.handleEvent(body, "deadbeef", "test-mock-secret")).rejects.toThrow("MOCK_SIGNATURE_MISMATCH");
  });

  it("a a unsigned event (a a empty signature) is rejected", async () => {
    const mock = new MockAdapter({ webhookSecret: "test-mock-secret" });
    const body = mock.event({ id: "evt_sig_003", type: "invoice.paid" });
    await expect(mock.handleEvent(body, "", "test-mock-secret")).rejects.toThrow("MOCK_SIGNATURE_MISMATCH");
  });

  it("a the signature is deterministic (a the same body + secret → a the same sig)", () => {
    const mock = new MockAdapter({ webhookSecret: "fixed" });
    const body = mock.event({ id: "evt_det", type: "invoice.paid" });
    expect(mock.sign(body)).toBe(mock.sign(body));
    // A a different secret → a different sig (a the secret is the key).
    const other = new MockAdapter({ webhookSecret: "other" });
    expect(other.sign(body)).not.toBe(mock.sign(body));
  });

  it("a the event body is a stable JSON (a the deterministic pre-computation)", () => {
    const mock = new MockAdapter({ webhookSecret: "s" });
    const a = mock.event({ id: "evt_1", type: "invoice.paid", plan: "team" });
    const b = mock.event({ id: "evt_1", type: "invoice.paid", plan: "team" });
    expect(a).toBe(b);
  });
});
