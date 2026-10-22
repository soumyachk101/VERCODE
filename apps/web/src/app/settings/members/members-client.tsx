"use client";

// /settings/members (PAGE §7.1). The identity column is the member: a
// stable initial + a pale per-person hue tint (two people ≥60° apart).
// The role pill (owner/admin/developer/viewer), the last-active, and the
// Change role + Remove actions. The LAST_OWNER rule: an owner's removal
// is guarded by the "Transfer ownership first" note (a 409 from the
// API, surfaced in words). The invite action is the primary in the title
// row (US-003).
import { useState } from "react";
import { OrgPage } from "@/components/page";
import { useOrgShell } from "@/components/OrgShell";
import {
  useMembers,
  useChangeRole,
  useRemoveMember,
  useInvite,
} from "@/lib/hooks";
import { PageHead } from "@/components/Settings";
import { DataBlock, EmptyBlock } from "@/components/DataBlock";
import { Panel, PanelTitle } from "@/components/cards";
import { Table, TRow, TCell } from "@/components/Table";
import { Pill } from "@/components/Pill";
import { Button, TextButton } from "@/components/Button";
import { ConfirmDialog } from "@/components/BlockError";
import { Input, Label } from "@/components/controls";
import { initials, personHue, relativeTime } from "@/lib/format";

const ROLES = ["admin", "developer", "viewer"] as const;

export function MembersClient() {
  return (
    <OrgPage>
      <MembersBody />
    </OrgPage>
  );
}

function MembersBody() {
  const s = useOrgShell();
  const orgId = s.active?.id ?? "";
  const q = useMembers(orgId || undefined);
  const changeRole = useChangeRole(orgId);
  const remove = useRemoveMember(orgId);
  const invite = useInvite(orgId);

  const [roleEdit, setRoleEdit] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; role: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>("developer");

  const members = q.data?.members ?? [];

  return (
    <div>
      <PageHead
        title="Members"
        finding={members.length > 0 ? `${members.length} members in this org` : undefined}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Input
              type="email"
              placeholder="name@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={{ width: 200, height: 32 }}
              aria-label="Invite by email"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])}
              aria-label="Invite role"
              style={{
                height: 32,
                border: "1px solid var(--control)",
                borderRadius: "var(--radius-control)",
                background: "var(--surface)",
                color: "var(--text)",
                fontSize: 13,
                padding: "0 8px",
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!inviteEmail || invite.isPending}
              onClick={() => {
                void invite.mutate({ email: inviteEmail, role: inviteRole });
              }}
            >
              {invite.isPending ? "Inviting…" : "Invite"}
            </Button>
          </div>
        }
      />
      {invite.isError && (
        <p className="meta" role="status" style={{ color: "var(--negative)" }}>
          {String(invite.error?.message ?? "Invite failed")}
        </p>
      )}
      {invite.isSuccess && (
        <p className="meta" role="status">
          Invited {invite.data?.email} as {invite.data?.role}.
        </p>
      )}
      <Panel>
        <PanelTitle>Members</PanelTitle>
        <DataBlock result={q} block="members">
          {() =>
            members.length === 0 ? (
              <EmptyBlock>No members yet — invite the first admin above</EmptyBlock>
            ) : (
              <Table
                caption="Members: the person, their email, role, last active, and the change-role / remove actions"
                head={[
                  { label: "Member", width: "28%" },
                  { label: "Email" },
                  { label: "Role" },
                  { label: "Last active" },
                  { label: "Actions", align: "right" },
                ]}
              >
                {members.map((m) => {
                  const hue = personHue(m.id || m.email);
                  const isOwner = m.role === "owner";
                  return (
                    <TRow key={m.id}>
                      <TCell>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "var(--radius-control)",
                              background: `hsl(${hue} 45% 90%)`,
                              color: "var(--text)",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 600,
                              border: "1px solid var(--rule)",
                            }}
                          >
                            {initials(m.name || m.email)}
                          </span>
                          <span style={{ fontSize: 14, color: "var(--text)" }}>{m.name}</span>
                        </span>
                      </TCell>
                      <TCell>
                        <span className="meta">{m.email}</span>
                      </TCell>
                      <TCell>
                        {isOwner ? (
                          <Pill tone="neutral">owner</Pill>
                        ) : roleEdit === m.id ? (
                          <select
                            autoFocus
                            aria-label="Change role"
                            value={m.role}
                            onChange={(e) => {
                              void changeRole.mutate({ userId: m.id, role: e.target.value });
                              setRoleEdit(null);
                            }}
                            onBlur={() => setRoleEdit(null)}
                            style={{
                              height: 28,
                              border: "1px solid var(--control)",
                              borderRadius: "var(--radius-control)",
                              background: "var(--surface)",
                              color: "var(--text)",
                              fontSize: 13,
                            }}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Pill tone="neutral">{m.role}</Pill>
                        )}
                        {changeRole.isSuccess &&
                          changeRole.data != null &&
                          changeRole.data.userId === m.id && (
                            <span className="meta" role="status">
                              saved
                            </span>
                          )}
                      </TCell>
                      <TCell>
                        <span className="meta">{m.lastActiveAt ? relativeTime(m.lastActiveAt) : "—"}</span>
                      </TCell>
                      <TCell right>
                        {isOwner ? (
                          <span className="meta" style={{ fontSize: 12, color: "var(--faint)" }}>
                            LAST_OWNER — transfer ownership first
                          </span>
                        ) : (
                          <div style={{ display: "inline-flex", gap: 8 }}>
                            <TextButton onClick={() => setRoleEdit(m.id)} style={{ fontSize: 12 }}>
                              Change role
                            </TextButton>
                            <TextButton
                              onClick={() => setRemoveTarget({ id: m.id, role: m.role })}
                              style={{ fontSize: 12, color: "var(--negative)" }}
                            >
                              Remove
                            </TextButton>
                          </div>
                        )}
                      </TCell>
                    </TRow>
                  );
                })}
              </Table>
            )
          }
        </DataBlock>
        {remove.isError && (
          <p className="meta" role="status" style={{ color: "var(--negative)", marginTop: 8 }}>
            {String(remove.error?.message ?? "Remove failed")}
          </p>
        )}
      </Panel>

      <ConfirmDialog
        open={removeTarget != null}
        onOpenChange={(v) => {
          if (!v) setRemoveTarget(null);
        }}
        title="Remove this member?"
        body={
          removeTarget ? (
            <span>
              They lose access to this org immediately. If they were the last admin, a
              different admin will have to re-invite them.
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="Remove member"
        onConfirm={() => {
          if (removeTarget) {
            remove.mutate(removeTarget.id, {
              onSettled: () => setRemoveTarget(null),
            });
          }
        }}
        confirming={remove.isPending}
      />
    </div>
  );
}
