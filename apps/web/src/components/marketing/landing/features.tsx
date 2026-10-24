import {
  IconBolt,
  IconBranch,
  IconGauge,
  IconLock,
  IconSliders,
  IconSparkles,
} from "../icons";

// Capability copy is evidence-backed; the cost-discipline card is written
// in terms of model routing (strong model only where it earns it).
const FEATURES = [
  {
    icon: IconBolt,
    title: "Zero-config detection",
    body: "VERCODE reads your manifests and directory shape to pre-fill lint targets, review tasks, and file budgets: every detection is an editable rule, not a hidden guess.",
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
    body: "The strong model routes to the tasks that earn it; static analysis carries everything else at near-zero cost, and per-review cost accounting shows where the spend went.",
  },
];

export function Features() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
      <div className="max-w-2xl">
        <h2 className="text-[28px] font-bold tracking-[-0.01em] text-[hsl(var(--text-1))] sm:text-[34px]">
          What VERCODE does on every pull request
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-[hsl(var(--text-2))]">
          Deterministic analysis first, evidence-backed AI second, your rules
          enforced at the merge gate. Every capability below is something you
          can point at in the dashboard.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--line))] sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <article key={f.title} className="bg-[hsl(var(--panel))] p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[hsl(var(--line))] bg-[hsl(var(--highlight))]">
              <f.icon width={20} height={20} className="text-[var(--accent-color)]" />
            </div>
            <h3 className="mt-5 text-[16px] font-semibold text-[hsl(var(--text-1))]">{f.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[hsl(var(--text-2))]">{f.body}</p>
          </article>
        ))}
      </div>

      {/* the stats strip: tabular numbers, no monospace (house rule) */}
      <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--line))] sm:grid-cols-4">
        {[
          ["<120s", "review published at p50"],
          ["0.6", "default confidence floor"],
          ["5", "least-privilege App scopes"],
          ["180 days", "audit log retention"],
        ].map(([value, label]) => (
          <div key={label} className="bg-[hsl(var(--panel))] px-5 py-6">
            <dt className="order-last mt-1 text-[12px] uppercase tracking-wider text-[hsl(var(--text-3))]">
              {label}
            </dt>
            <dd className="text-[24px] font-semibold tabular-nums text-[hsl(var(--text-1))]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
