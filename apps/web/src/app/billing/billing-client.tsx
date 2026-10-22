"use client";

// /billing (PAGE §5.2). The plan state leads; the invoices table is a
// real table; the upgrade/downgrade/cancel controls are last, with a
// destructive cancel that names the consequence + a confirmation
// dialog (ACCESSIBILITY §5). The "Upgrading…" pending state is honest:
// it persists until the verified webhook confirms it (AC-403).
import { useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import {
  useBilling,
  useSubscribe,
  useCancelSubscription,
} from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle } from "@/components/cards";
import { Table, TRow, TCell } from "@/components/Table";
import { Pill } from "@/components/Pill";
import { PlanTrack } from "@/components/PlanTrack";
import { Button, TextButton } from "@/components/Button";
import { ConfirmDialog } from "@/components/BlockError";
import { money, relativeTime } from "@/lib/format";
import { ALL_PLANS, PLAN_QUOTA } from "@/lib/plans";

export function BillingClient() {
  return (
    <OrgPage>
      <BillingBody />
    </OrgPage>
  );
}

function BillingBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const q = useBilling(orgId || undefined);
  const subscribe = useSubscribe(orgId);
  const cancel = useCancelSubscription(orgId);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const b = q.data;

  // the plan-state pill: active / past_due / canceled / "Upgrading…"
  // (AC-403's pending state — an honest "confirmed at next invoice",
  // never claimed complete from a client claim)
  const statePill =
    b?.status === "upgrading" ? (
      <Pill tone="warning">Upgrading — confirmed at next invoice</Pill>
    ) : b?.status === "past_due" ? (
      <Pill tone="negative">past_due</Pill>
    ) : b?.status === "canceled" ? (
      <Pill tone="negative">canceled</Pill>
    ) : (
      <Pill tone="positive">active</Pill>
    );

  // the past_due quiet notice (a pale amber border, never a ground)
  const notice = b?.status === "past_due" ? (
    <div
      role="status"
      style={{
        border: "1px solid var(--notice-border)",
        background: "var(--surface)",
        borderRadius: "var(--radius-card)",
        padding: "8px 12px",
        fontSize: 13,
        color: "var(--pill-warning-ink)",
        marginBottom: 12,
      }}
    >
      Payment is past due — reviews will skip when the quota is reached.
      <TextButton className="ml-2" onClick={() => {}}>
        Update payment method
      </TextButton>
    </div>
  ) : null;

  return (
    <div>
      <PageHead
        title="Billing"
        finding={
          b
            ? `Plan: ${b.plan} · ${b.renewalAt ? `renews ${relativeTime(b.renewalAt)}` : "no renewal scheduled"}`
            : "Plan, invoices, and quota"
        }
      />
      <div style={{ display: "grid", gap: 16 }}>
        {notice}

        {/* 1. the plan state + the quota */}
        <Panel>
          <PanelTitle>Plan</PanelTitle>
          <DataBlock result={q} block="billing">
            {() => {
              const b = q.data!;
              return (
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 24, fontWeight: 600, color: "var(--text)", textTransform: "capitalize" }}>
                      {b.plan}
                    </span>
                    {statePill}
                    {b.renewalAt && (
                      <span className="meta">renews {relativeTime(b.renewalAt)}</span>
                    )}
                  </div>
                  <PlanTrack used={b.quota.used} limit={b.quota.limit} unit="reviews" />
                </div>
              );
            }}
          </DataBlock>

          {/* the plan selector: one row, a segmented control (switch, not
                overlay) + the one primary "Upgrade" */}
          <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {ALL_PLANS.map((p) => (
              <PlanChoice key={p} current={b?.plan} plan={p} onPick={(pl) => subscribe.mutate({ plan: pl })} />
            ))}
            <Button
              variant={subscribe.isPending ? "secondary" : "default"}
              disabled={subscribe.isPending || b?.status === "upgrading"}
              onClick={() => {}}
            >
              {subscribe.isPending ? "Working…" : b?.status === "upgrading" ? "Upgrading…" : "Upgrade"}
            </Button>
            {subscribe.data?.plan && (
              <span className="meta" role="status">
                Upgrading to {subscribe.data.plan} — confirmed at next invoice
              </span>
            )}
          </div>
        </Panel>

        {/* 2. the invoices list */}
        <Panel>
          <PanelTitle>Invoices</PanelTitle>
          <DataBlock result={q} block="invoices">
            {() => {
              const b = q.data!;
              if (b.invoices.length === 0) {
                return <EmptyBlock>No invoices yet</EmptyBlock>;
              }
              return (
                <Table
                  caption="Invoices: date, amount, status, and a download action"
                  head={[
                    { label: "Date" },
                    { label: "Amount", align: "right" },
                    { label: "Status" },
                    { label: "" },
                  ]}
                >
                  {b.invoices.map((inv) => (
                    <TRow key={inv.id}>
                      <TCell>{relativeTime(inv.date)}</TCell>
                      <TCell right>{money(inv.amountUsd)}</TCell>
                      <TCell>
                        <Pill tone={inv.status === "paid" ? "positive" : inv.status === "open" ? "warning" : "negative"}>
                          {inv.status}
                        </Pill>
                      </TCell>
                      <TCell right>
                        <TextButton onClick={() => {}}>
                          Download
                        </TextButton>
                      </TCell>
                    </TRow>
                  ))}
                </Table>
              );
            }}
          </DataBlock>
        </Panel>

        {/* 3. the cancel control (destructive, last, consequence-named) */}
        <Panel>
          <PanelTitle>Cancel</PanelTitle>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <p className="meta" style={{ margin: 0 }}>
              Cancel at period end — the plan stays active until the renewal date, then the
              account moves to the free tier. Reviews will skip once the free quota is reached.
            </p>
            <Button
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => setConfirmCancel(true)}
            >
              {cancel.isPending ? "Working…" : "Cancel at period end"}
            </Button>
          </div>
          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title="Cancel your subscription?"
            body={
              <span>
                Your {b?.plan ?? "current"} plan ends at period end. After that, the account
                moves to the free tier (50 reviews/month) and new reviews will skip once the
                free quota is reached. This takes effect on {b?.renewalAt ? relativeTime(b.renewalAt) : "the renewal date"} — you can reactivate before then.
              </span>
            }
            confirmLabel="Cancel subscription"
            onConfirm={() => {
              void cancel.mutate();
            }}
            confirming={cancel.isPending}
          />
        </Panel>
      </div>
    </div>
  );
}

function PlanChoice({
  current,
  plan,
  onPick,
}: {
  current?: string;
  plan: string;
  onPick: (plan: string) => void;
}) {
  const on = current === plan;
  return (
    <button
      type="button"
      aria-pressed={on}
      className="pressable"
      onClick={() => onPick(plan)}
      style={{
        height: 32,
        padding: "0 14px",
        borderRadius: "var(--radius-control)",
        border: `1px solid ${on ? "var(--control)" : "var(--border)"}`,
        background: on ? "var(--active)" : "var(--surface)",
        color: "var(--text)",
        fontSize: 13,
        fontWeight: 500,
        textTransform: "capitalize",
      }}
    >
      {plan}
    </button>
  );
}
