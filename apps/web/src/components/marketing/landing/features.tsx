import {
  IconBolt,
  IconBranch,
  IconGauge,
  IconLock,
  IconSliders,
  IconSparkles,
} from "../icons";

const FEATURES = [
  {
    icon: IconBolt,
    title: "Zero-config detection",
    body: "VERCODE reads your manifests and directory shape to pre-fill lint targets, review tasks, and file budgets — every detection is an editable rule, not a hidden guess.",
  },
  {
    icon: IconSparkles,
    title: "Git-aware AI review",
    body: "The model reviews the bounded diff with one-hop import context, routed by task: concurrency on Go, type contracts on TypeScript. Never the whole repository.",
  },
  {
    icon: IconSliders,
    title: "Your rules, enforced",
    body: "Write org and repo rules in plain statements or point at your lint config. VERCODE publishes the verdict as a required check, so the gate is real branch protection.",
  },
  {
    icon: IconGauge,
    title: "Code health scoring",
    body: "A weighted 0–100 index over open findings, finding age, coverage delta, complexity drift, and security exposure — recomputed after every review.",
  },
  {
    icon: IconLock,
    title: "Least-privilege GitHub App",
    body: "Five scopes, no secrets access, source analyzed but never persisted. BYOK keys are KMS-wrapped and decrypted only at the edge of the provider call.",
  },
  {
    icon: IconBranch,
    title: "Cost discipline by design",
    body: "Per-plan quotas and per-review cost accounting: the strong model runs only where it earns its spend, and the static pass costs almost nothing.",
  },
];

export function Features() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
      <div className="max-w-2xl">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[hsl(hsl(var(--accent)))]">
          Capabilities
        </span>
        <h2 className="mt-3 text-[28px] font-bold tracking-[-0.01em] text-[hsl(var(--text-1))] sm:text-[34px]">
          Built on four principles, shipped as six features
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-[hsl(var(--text-2))]">
          Deterministic first, evidence-backed, cost-disciplined, and a workspace —
          not just a bot. Every feature below is one of those principles you can
          point at in the dashboard.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--line))] sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <article key={f.title} className="bg-[hsl(var(--panel))] p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[hsl(var(--line))] bg-[hsl(var(--highlight))]">
              <f.icon width={20} height={20} className="text-[hsl(hsl(var(--accent)))]" />
            </div>
            <h3 className="mt-5 text-[16px] font-semibold text-[hsl(var(--text-1))]">{f.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[hsl(var(--text-2))]">{f.body}</p>
          </article>
        ))}
      </div>

      {/* the stats strip */}
      <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--line))] sm:grid-cols-4">
        {[
          ["<120s", "review published at p50"],
          ["5,000", "reviews a month on Team"],
          ["0.6", "default confidence floor"],
          ["180 days", "audit log retention"],
        ].map(([value, label]) => (
          <div key={label} className="bg-[hsl(var(--panel))] px-5 py-6">
            <dt className="order-last mt-1 text-[12px] uppercase tracking-wider text-[hsl(var(--text-3))]">
              {label}
            </dt>
            <dd className="font-mono text-[24px] font-semibold tabular-nums text-[hsl(var(--text-1))]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
