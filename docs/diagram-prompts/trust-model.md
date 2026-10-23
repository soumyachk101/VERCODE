# VERCODE Trust Model & Security Boundaries — Prompt

> **Output format:** PNG (rendered from SVG source; keep the SVG on disk as the
> source of truth, export at 2× scale for crispness). Save to
> `docs/assets/trust-model.png`. The SVG stays at `docs/assets/trust-model.svg`.
> **Canvas:** 1240 × 520. PNG export: 2480 × 1040 px.
> **Structure:** 3 horizontal domain cards (left → right), each 276 px tall, y = 78. Two vertical gate columns between the domains. Bottom strip: 3 invariant cards, y = 378, height 118.

---

## Title bar

```
VERCODE — Trust Model & Security Boundaries
Core Invariant: Repository content is treated strictly as input, never as authority
("input" in bold red, "authority" in bold green)
```

---

## Domain 1 — UNTRUSTED (left card, red top strip, x = 35, width = 350)

Header: `1. UNTRUSTED DOMAIN` (red badge), right-aligned tag `External & Adversarial` (red text)

4 item boxes (light red fill `#fef2f2`, 326 × 48 px, stacked vertically with 8 px gap):

| Item title | Sub text |
| --- | --- |
| PR Unified Diffs & Code Content | Untrusted repository files · 1-hop AST imports |
| PR Titles, Bodies & Comments | Prompt injection attack surface · treated as data only |
| Incoming Webhook Deliveries | Third-party network triggers · forge & replay risks |
| Raw AI Provider Completions | Untrusted until Zod schema validation & line anchoring |

---

## Ingress Gate (between Domain 1 and Domain 2)

- Red arrow from Domain 1 right edge to Domain 2 left edge (y = 216, x = 385 → 438)
- White gate box (40 × 72 px, x = 392, y = 180) with vertical text `H M A C` in red, one letter per line
- Border of gate box: `#f87171`, stroke width 1.2

---

## Domain 2 — PLATFORM TRUSTED CORE (middle card, blue top strip, x = 440, width = 385)

Header: `2. PLATFORM TRUSTED CORE` (blue badge), right-aligned tag `Zero-Trust Compute` (blue text)

4 item boxes (light blue fill `#eff6ff`, 361 × 48 px, stacked):

| Item title | Sub text |
| --- | --- |
| Fastify API Ingress Gateway | HMAC verify · 5-min window · dedup (<300 ms, zero LLM) |
| BullMQ Review Engine Worker | Deterministic-first · ESLint/Semgrep · schema-guarded AI |
| Managed State (PostgreSQL 16 & Redis 7) | Persist-then-publish · session revocation · DLQ |
| Cloud Key Management (KMS) | App private key KMS-wrapped · BYOK AES-256-GCM ciphertexts |

---

## Egress Gate (between Domain 2 and Domain 3)

- Green arrow from Domain 2 right edge to Domain 3 left edge (y = 216, x = 825 → 878)
- White gate box (40 × 72 px, x = 832, y = 180) with vertical text `R B A C` in green, one letter per line
- Border of gate box: `#86efac`, stroke width 1.2

---

## Domain 3 — EXECUTION SANDBOX (right card, green top strip, x = 880, width = 325)

Header: `3. EXECUTION SANDBOX` (green badge), right-aligned tag `Isolated & Ephemeral` (green text)

4 item boxes (light green fill `#f0fdf4`, 301 × 48 px, stacked):

| Item title | Sub text |
| --- | --- |
| Static Analysis Process Isolation | ESLint / Semgrep AST runners with memory & CPU caps |
| Ephemeral PR Test Sandbox (Phase 2) | gVisor / Firecracker microVM · untrusted code execution |
| AI Provider Boundaries | Zero data retention headers · no model training (NFR-29) |
| GitHub API Publication Egress | Short-lived installation tokens · scoped pull_requests:write |

---

## Bottom invariant strip (3 cards, y = 378, height = 118)

All cards: white fill, 1.2 px border, 3 px colored top strip matching their invariant color.

### Invariant 1 — DATA ONLY (red strip, x = 35, width = 370)
- Badge: `INVARIANT 1: DATA ONLY` (red)
- Bold line: `Repository content is input, never authority.`
- Bullets:
  - Prompt injection cannot alter pipeline control flow
  - Model output validated strictly against Zod contracts
  - Dropped or demoted if anchor is invalid in diff

### Invariant 2 — ISOLATION (blue strip, x = 430, width = 380)
- Badge: `INVARIANT 2: ISOLATION` (blue)
- Bold line: `Multi-tenant isolation by construction.`
- Bullets:
  - org_id leading index on every tenant table
  - Cross-tenant queries return 404, never 403 (no oracle)
  - Redis keys scoped strictly by org:repo:id

### Invariant 3 — REDACTION (green strip, x = 835, width = 370)
- Badge: `INVARIANT 3: REDACTION` (green)
- Bold line: `Zero secrets stored or logged in plaintext.`
- Bullets:
  - GitHub App private key wrapped in Cloud KMS
  - BYOK keys encrypted with AES-256-GCM ciphertexts
  - Pre-commit & runtime redaction gates on logs

---

## Caption to place above the diagram in the README

```
VERCODE's security model rests on three hard boundaries. All external
content — diffs, PR bodies, webhook payloads, and raw LLM completions —
enters through the HMAC-verified ingress gate and is treated as data,
never as control flow. The platform core is the only tier that can reach
durable state; all egress (GitHub API calls, AI provider requests, static
analysis subprocesses) passes through the RBAC gate, keeping the
untrusted execution sandbox isolated and ephemeral.
```
