const STEPS = [
  {
    num: "01",
    title: "Install the GitHub App",
    body: "Five least-privilege scopes — contents:read, pull_requests:write, checks:write, metadata:read, issues:read. No admin:org, no secrets. VERCODE detects your stack on install and pre-fills your rules.",
  },
  {
    num: "02",
    title: "Open a pull request",
    body: "GitHub dispatches the webhook; VERCODE verifies the signature and enqueues the review job in under 300 milliseconds. The queue does the work, not the request — no model call on the webhook path.",
  },
  {
    num: "03",
    title: "Read the review",
    body: "Static analysis runs first, the task-routed AI stage runs on the bounded diff, and a verdict plus inline findings land on the pull request in under two minutes at p50. Your rules gate the merge.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-y border-[hsl(var(--line))] bg-[hsl(var(--panel))]">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[hsl(hsl(var(--accent)))]">
            How it works
          </span>
          <h2 className="mt-3 text-[28px] font-bold tracking-[-0.01em] text-[hsl(var(--text-1))] sm:text-[34px]">
            Three steps from install to a gated merge
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[hsl(var(--text-2))]">
            The same three steps every time — there is no configuration phase
            between them and no infrastructure to run.
          </p>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.num}
              className="rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--background))] p-6"
            >
              <span className="font-mono text-[32px] font-bold leading-none text-[hsl(hsl(var(--accent)))]">
                {step.num}
              </span>
              <h3 className="mt-4 text-[17px] font-semibold text-[hsl(var(--text-1))]">
                {step.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[hsl(var(--text-2))]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
