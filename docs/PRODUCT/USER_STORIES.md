# VERCODE — User Stories

Each story: `US-<n>` — *As a* role, *I want* capability, *so that* value. Priorities: P0 = MVP, P1 = next, P2 = later.

## Authentication & Organizations

| ID | Story | Priority |
| --- | --- | --- |
| US-001 | As a visitor, I want to sign up with email + password, so that I can create an account. | P0 |
| US-002 | As a new user, I want to create an organization, so that I can start connecting GitHub. | P0 |
| US-003 | As an Org Owner, I want to invite teammates by email, so they can join with the right role. | P0 |
| US-004 | As an Org Admin, I want to change a member's role, so access stays correct as people move. | P0 |
| US-005 | As a member, I want to accept an invitation link, so I can join the org. | P0 |
| US-006 | As a member, I want to leave an organization, so my access is cleanly revoked. | P1 |
| US-007 | As an Owner, I want to delete the organization (and its data per retention), so I can end the relationship. | P1 |
| US-008 | As a member, I want to sign out of all sessions, so I can revoke stray devices. | P0 |

## GitHub Connection

| ID | Story | Priority |
| --- | --- | --- |
| US-101 | As an Owner/Admin, I want to install the GitHub App, so PRs in my repos get reviewed. | P0 |
| US-102 | As an Admin, I want to see which repos are connected and their health, so I know coverage. | P0 |
| US-103 | As an Admin, I want to disconnect a repo or the whole App, so I stop reviews there. | P0 |
| US-104 | As a Developer, I want PRs I open to be reviewed automatically, without extra steps. | P0 |
| US-105 | As a Developer, I want to request a re-review of an open PR, so I get fresh findings. | P0 |
| US-106 | As an Admin, I want webhook failures to be observable and retryable, so integration is reliable. | P0 |

## Reviews & Findings

| ID | Story | Priority |
| --- | --- | --- |
| US-201 | As a PR author, I want a summary verdict on my PR, so I know at a glance the risk posture. | P0 |
| US-202 | As a PR author, I want inline comments on the actual changed lines, so feedback is directly actionable. | P0 |
| US-203 | As a reviewer, I want each finding to carry severity, category, and a suggested fix, so I can prioritize. | P0 |
| US-204 | As a reviewer, I want findings I disagree with marked "dismissed", so noise is fed back to the system. | P0 |
| US-205 | As a tech lead, I want an org-wide security-findings rollup, so I can triage risk fast. | P0 |
| US-206 | As a tech lead, I want finding trends by category and repo, so I spot systemic issues. | P0 |
| US-207 | As a tech lead, I want to suppress noisy finding categories per repo, so the signal stays high. | P0 |
| US-208 | As a Developer, I want to filter findings by severity/category in the review detail, so I focus. | P0 |
| US-209 | As a tech lead, I want to see the AI's reasoning per finding (evidence), so I can judge it. | P0 |
| US-210 | As a reviewer, I want to expand a finding to see the diff context and surrounding lines. | P1 |

## Configuration

| ID | Story | Priority |
| --- | --- | --- |
| US-301 | As an Admin, I want to set a confidence floor for the org, so I control noisiness. | P0 |
| US-302 | As an Admin, I want to choose the AI provider and per-task model routing, so I balance cost/quality. | P0 |
| US-303 | As an Admin, I want to set per-review file caps, so huge diffs don't blow cost. | P0 |
| US-304 | As an Admin, I want to store an encrypted BYOK API key, so my org controls spend/provider. | P1 |
| US-305 | As an Admin, I want versioned custom rules, so changes are auditable. | P1 |

## Usage, GitHub Connect, Audit

| ID | Story | Priority |
| --- | --- | --- |
| US-401 | As an Owner, I want to see plain org usage reporting (per-review tokens, model, USD cost), so I know what the reviews cost — no plans or quotas. | P0 |
| US-402 | As an Admin, I want to connect GitHub (handle-only personal OAuth) and re-enable disconnected repos from the connect card, so I extend review coverage without re-installing. | P0 |
| US-403 | As an Admin, I want to choose which connected repos are active for review, so I control where VERCODE posts. | P0 |
| US-404 | As an Owner, I want a per-review cost breakdown (tokens, model, USD), so I trust the usage numbers. | P0 |
| US-405 | As an Owner, I want to export usage history, so I can report internally. | P1 |
| US-406 | As an Admin, I want a complete audit log (actor, action, timestamp, IP), so I can investigate. | P0 |
| US-407 | As an Admin, I want the audit log to survive retention policies, so it's trustworthy. | P0 |

## Account & Settings

| ID | Story | Priority |
| --- | --- | --- |
| US-501 | As a member, I want to update my profile (name, email) and password. | P0 |
| US-502 | As a member, I want to see active sessions and sign them out. | P0 |
| US-503 | As a member, I want to prefer dark mode in the dashboard, so it's comfortable. | P0 |

## Out of scope (MVP) — tracked, not built

- US-601 IDE extension (P2)
- US-602 GitLab/Bitbucket adapters (P2)
- US-603 Untrusted test-execution sandbox (P2)
- US-604 Embeddings-based semantic retrieval (P2)
- US-605 SSO (SAML/OIDC) (P1)
