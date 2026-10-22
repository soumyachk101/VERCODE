# VERCODE — Sandbox Security

The isolation boundary for *running untrusted code* — the Phase-2 capability "run the PR's own tests and report failures as findings." This document designs the boundary **now** (so Phase 2 is additive, not a redesign, ADR-008), but the capability ships in Phase 2; in MVP the threat is *absent* (analysis only).

## 1. Why a separate boundary (and not "just run it in the worker")

The worker holds **production credentials** (Postgres, Redis, the GitHub App key, the AI provider key). Running untrusted code *in the worker* means a malicious PR's code runs in a process that can read the database, the queue, and the provider key — a T-08 critical is *by construction*, not by misconfiguration. The sandbox therefore:

1. Is a **separate process/container** from the worker and the trusted core.
2. Holds **zero production credentials** — its env is a minimal, whitelisted set (a test runner's toolchain, nothing else).
3. Has **no network egress** (deny-by-default) — a test that tries to phone home has no route.
4. Runs on **ephemeral, writable-only-for-the-run** storage — nothing persists.
5. Is **resource-capped** (CPU, mem, time, PIDs) — a fork-bomb or infinite test loop is bounded.

The *only* thing that crosses back into the trusted core is a **structured result** (pass/fail, a bounded failure log, timing). The sandbox process's memory, filesystem, and env are *not* crossed back.

## 2. The isolation technology (chosen per deployment class)

| Class | Technology | Notes |
| --- | --- | --- |
| Default (managed K8s) | **gVisor** (runsc) runtime on the sandbox pod | Syscall interception; a malicious `execve`/`open` is intercepted at the kernel boundary. Good default, low ops burden |
| High-isolation (Enterprise / regulated) | **Firecracker** micro-VM | Harder to escape (VM boundary, not a syscall filter); for orgs that need the strongest guarantee |
| Minimal (cost-sensitive) | Container-namespace isolation + seccomp-bpf + no-NEW-PRIV + read-only root | The floor; acceptable for low-risk, non-sensitive repos; *not* sufficient for Enterprise data-residency commitments |

The **selection is per-org** (an Enterprise plan can require Firecracker; a Free org may get the floor), and the *contract* (what the result is, what the boundary guarantees) is identical across all three — the org gets the same structured result; only the isolation *strength* differs by tier.

## 3. The sandbox's inputs (whitelisted, minimized)

| Input | What crosses in | Control |
| --- | --- | --- |
| The PR's code | The diff + the changed files (bounded, as in review) — *not* the whole repo | The context budget applies (CONTEXT_RETRIEVAL) |
| The test toolchain | A *pinned, pre-baked* language toolchain image (node/python/go runtime) — the same image for all runs | No org-supplied toolchain in MVP (an org-supplied `Dockerfile` is a P3, and would need its own image-scan gate) |
| An env | A **whitelisted** minimal env: `PATH`, `HOME`, a temp dir. **No** `DATABASE_URL`, no provider keys, no GitHub tokens, no KMS creds | The "no production credentials" invariant is *checked*, not assumed — a sandbox boot asserts its env contains none of the platform secrets (a negative test, T-08) |
| Network | **None.** Egress deny-by-default; the toolchain is pre-baked (no `npm install` from the network in MVP — a networked install is a P3 with its own registry-allowlist + proxy) | A test that needs the network fails fast with a *clear, non-exploitable* error, it does not reach the network |

## 4. The sandbox's outputs (the only thing that crosses back)

```
{
  status: "passed" | "failed" | "timeout" | "error",
  durationMs: number,
  failureLog: string        // bounded (e.g., 50 KB), redacted, trimmed
  tests: [{ name, passed, durationMs? }]   // optional, bounded
}
```

- **Bounded** — a failure log is trimmed to a cap (a test that emits a 10 MB log is truncated, not a DoS).
- **Redacted** — the log passes through the same `redact()` gate (a test that prints a secret we *did* give it — we don't give it secrets, but a test could print *its own* input constants — is masked).
- **No memory, no filesystem, no env** crosses back — only the structured result.

## 5. Resource limits (the caps)

| Resource | Cap | Enforcement |
| --- | --- | --- |
| CPU | 2 vCPU per run | container runtime |
| Memory | 1 GiB per run | container runtime (OOM → `status: "error"`, not a host crash) |
| Time | 300 s hard timeout (configurable, capped at the pipeline budget) | a `kill` on breach → `status: "timeout"` |
| PIDs | 512 per sandbox (fork-bomb cap) | `pids` cgroup limit |
| Filesystem | 1 GiB ephemeral scratch, wiped on run end | read-only root + a tmpfs scratch |
| Output | 50 KB failure log cap | truncation in the result |

## 6. The cleanup lifecycle (no residue)

1. **Ephemeral by construction:** the sandbox runs in an ephemeral container/VM that is *destroyed* at run end — no persistent filesystem, no persistent network namespace, no persistent env.
2. **Wipe-on-error:** a timeout/OOM/crash destroys the sandbox the same way (the lifecycle is the same on the error path — no "leave it running for debugging" mode that could hold state).
3. **No debug attach in prod:** prod sandboxes have no debug port, no console attach, no core-dump persistence (a crash produces a structured error, not a coredump an attacker could inspect).
4. **Result-only crossing** (as above) means the trusted core never holds a reference to the sandbox process.

## 7. Failure modes (and why they're safe)

| Failure | Behavior | Why it's safe |
| --- | --- | --- |
| Test OOM | `status: "error"`, sandbox destroyed, a finding notes "test execution OOM" | The host's memory is bounded by the cap; the sandbox dies, the run records a result |
| Test times out | `status: "timeout"` | The hard kill is the cap; no hung process holds resources |
| Test forks a bomb | PIDs cap → the spawn is refused | A fork-bomb is bounded by `pids=512` |
| Test tries to exfil (network) | No route (egress deny) → the call fails fast | There's nothing to reach; the attempt is logged, not enabled |
| Test reads a platform secret | It's not in the env (whitelist) → a read of `process.env.DATABASE_URL` returns undefined | The "no credentials" invariant means there's nothing to read |

## 8. Verification (`ST-sandbox-*`, Phase 2)

| Test | Assertion |
| --- | --- |
| `ST-sandbox-nocred` | The sandbox process's env contains **none** of the platform secrets (a negative env check at boot) |
| `ST-sandbox-egress` | A test that attempts an outbound connection fails (no route); the attempt is logged |
| `ST-sandbox-cap` | A test that OOMs / forks / loops hits its cap → a structured `error`/`timeout`, host unharmed |
| `ST-sandbox-clean` | After a run (success or failure), the sandbox filesystem/env are gone (no residue check) |
| `ST-sandbox-result-only` | The only data the worker receives from the sandbox is the structured result (no memory/fs/env field) |
| `ST-sandbox-malicious` | A fixture PR whose test suite tries to read `process.env`, open a socket, and fork-bomb → all three are blocked/recorded; the *review result* (pass/fail + finding) is correct and the platform is unharmed |

## 9. MVP posture (the "not present" is a feature)

In MVP, **the sandbox does not exist** (ADR-008): the worker does *analysis only* (ESLint/Semgrep over files), and no path executes repo code. The T-08 threat is closed by *absence*, not by the sandbox's strength. The design in this document is what makes Phase 2 *additive*: we add the `ST-sandbox-*` suite + the isolation boundary + the per-org tier selection, without touching the trusted core's credential model. The boundary contract (result-only crossing, no-creds env, egress-deny, caps, cleanup) is stable across the MVP→Phase-2 transition; only the *implementation* of the isolation (none → gVisor → Firecracker) is filled in.
