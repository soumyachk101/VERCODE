"use client";

// /settings/providers (PAGE §6.2). The routing table (task | provider |
// model | max-tokens); the BYOK masked field (sk-…abcd, raw key NEVER
// shown, Rotate + Revoke with a confirmation that names the object); and
// the configured fallback provider state.
import { useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import {
  useProviders,
  useByok,
  useByokRevoke,
} from "@/lib/hooks";
import { PageHead, SettingsSection } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Table, TRow, TCell } from "@/components/Table";
import { ByokField } from "@/components/ByokField";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/BlockError";
import { Input } from "@/components/controls";

export function ProvidersClient() {
  return (
    <OrgPage>
      <ProvidersBody />
    </OrgPage>
  );
}

function ProvidersBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const q = useProviders(orgId || undefined);
  const byok = useByok(orgId);
  const revoke = useByokRevoke(orgId);
  const [newKey, setNewKey] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const p = q.data;

  return (
    <div>
      <PageHead
        title="Providers"
        finding="Task routing, the BYOK key, and the configured fallback provider"
      />
      <div style={{ background: "var(--surface)", border: "1px solid var(--hard-border)", borderRadius: 8, padding: "0 20px" }}>
        <SettingsSection
          label="Task routing"
          description="Admin-set per task: which provider and model run each review stage. Rows show the in-force state."
        >
          <DataBlock result={q} block="task routing">
            {() => {
              const rows = q.data?.routing ?? [];
              if (rows.length === 0) {
                return <EmptyBlock>No routing rules configured — using the org default</EmptyBlock>;
              }
              return (
                <Table
                  caption="Task routing: the task, the provider, the model, the max tokens, and state"
                  head={[
                    { label: "Task", width: "26%" },
                    { label: "Provider" },
                    { label: "Model" },
                    { label: "Max tokens", align: "right" },
                    { label: "State" },
                  ]}
                >
                  {rows.map((r, i) => (
                    <TRow key={i}>
                      <TCell>
                        <span style={{ fontWeight: 500 }}>{r.task}</span>
                      </TCell>
                      <TCell>{r.provider}</TCell>
                      <TCell>{r.model}</TCell>
                      <TCell right>{r.maxTokens != null ? r.maxTokens : "—"}</TCell>
                      <TCell>
                        {r.available === false ? (
                          <span className="meta" aria-disabled="true" style={{ color: "var(--muted-ink)" }}>
                            unavailable — check provider config
                          </span>
                        ) : (
                          <span className="meta">in force</span>
                        )}
                      </TCell>
                    </TRow>
                  ))}
                </Table>
              );
            }}
          </DataBlock>
        </SettingsSection>

        <SettingsSection
          label="BYOK key"
          description="The raw key is KMS-wrapped on the server; only the last four characters round-trip to the UI. Rotate to set a new key; Revoke to deactivate it. The fallback provider takes over until a new key is set."
        >
          <DataBlock result={q} block="BYOK">
            {() => (
              <ByokField
                last4={p?.byok?.last4}
                active={p?.byok?.active ?? false}
                provider={p?.byok?.provider}
                onRotate={() => {
                  if (newKey) {
                    void byok.mutate({ provider: p?.byok?.provider ?? "openai", apiKey: newKey });
                  }
                }}
                onRevoke={() => setConfirmRevoke(true)}
              />
            )}
          </DataBlock>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Input
              type="password"
              autoComplete="off"
              placeholder="sk-…"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{ maxWidth: 280 }}
              aria-label="New BYOK key"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!newKey || byok.isPending}
              onClick={() => {
                void byok.mutate({
                  provider: p?.byok?.provider ?? "openai",
                  apiKey: newKey,
                });
                if (byok.isSuccess) setNewKey("");
              }}
            >
              {byok.isPending ? "Rotating…" : "Rotate"}
            </Button>
          </div>
          <ConfirmDialog
            open={confirmRevoke}
            onOpenChange={setConfirmRevoke}
            title="Revoke the BYOK key?"
            body={
              <span>
                The key is deactivated and deleted. The provider fallback takes over until a
                new key is set.
              </span>
            }
            confirmLabel="Revoke key"
            onConfirm={() => {
              void revoke.mutate();
              setConfirmRevoke(false);
            }}
            confirming={revoke.isPending}
          />
        </SettingsSection>

        <SettingsSection
          label="Fallback provider"
          description="The provider that runs the degraded static-only pipeline when the primary provider fails or the org is over its budget."
        >
          <p className="meta" style={{ margin: 0 }}>
            {p?.fallback ? `Fallback: ${p.fallback}` : "No fallback provider configured"}
          </p>
        </SettingsSection>
      </div>
    </div>
  );
}
