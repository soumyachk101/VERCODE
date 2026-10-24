// Client-safe marketing content: the VERCODE blog posts (apps/website's
// content/blog is the reference copy; this file is the self-contained
// source for the /blog surface in the dashboard app).

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingTime: string;
  tags: string[];
  body: string[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "enforcing-team-rules-on-every-commit",
    title: "How VERCODE enforces your team's rules on every commit",
    description:
      "Custom review rules are a policy engine, not a suggestion box: precedence, the confidence floor, quiet hours, and how a rule becomes a hard gate.",
    date: "2026-09-18",
    readingTime: "8 min read",
    tags: ["rules", "gates", "review"],
    body: [
      "Most teams don't fail at code review because reviewers are careless — they fail because the rules live in people's heads. 'We don't log raw PII.', 'Every external call needs a timeout.', 'No new dependencies without a ticket.' Every team has rules like these; few have anywhere to write them down where a machine can enforce them. That's the gap VERCODE fills: your rules become first-class review policy, evaluated on every commit that reaches a pull request.",
      "VERCODE rules live at two levels: the org level, which covers every repository in the organization, and the repo level, which can tighten — never loosen — the org defaults. Precedence is deterministic and documented: repo rules override org rules, and when two rules of the same scope collide, the stricter one wins. A rule author never has to guess which policy will fire; the evaluation order is the same on the PR gate as it is in the dashboard, and the audit trail records which rule produced which finding.",
      "Each rule carries the machinery that makes enforcement honest. AI-originated findings sit behind a confidence floor — default 0.6, configurable per organization — so a hedging model output never gets to gate a merge; deterministic rules such as your Semgrep or ESLint set carry no floor, because a rule is a rule, not a guess. You can suppress entire finding categories per repo, scope rules by language, and set quiet hours so a 3 a.m. CI run still reviews but only posts advisory findings. Every toggle is visible on the rules page before it is in force anywhere.",
      "Enforcement happens at the branch-protection boundary. VERCODE publishes its verdict as a GitHub check — approve, changes requested, or blocked by rule — and a one-line branch-protection setting makes that check required. When a required rule fires, the PR cannot merge until the finding is fixed or the exception is granted by someone with permission; the exception is a named, timestamped, expiring record, not a silent override. 'The team rules are enforced' stops being a slogan and becomes a property you can point at in the check runs.",
      "The design goal is a short path from 'we decided this' to 'the machine guarantees it.' Write the rule in plain words or point at an existing lint target, preview what it would have flagged on your last fifty reviews before it goes live, and watch the org's compliance curve on the dashboard. Ten minutes later, the rule is part of the merge contract for every repository you chose. That is what we mean by 'your rules, enforced': policy as code, gating as infrastructure.",
    ],
  },
  {
    slug: "the-10-day-setup-walkthrough",
    title: "The 10-day setup walkthrough",
    description:
      "Day by day: from installing the GitHub App to a required-check pipeline with custom rules, branch protection, and your first enforced merge.",
    date: "2026-09-02",
    readingTime: "12 min read",
    tags: ["onboarding", "github", "guides"],
    body: [
      "A week of AI code review should not require a week of meetings. VERCODE is built around a 10-day onboarding path: by day 10 a typical team has a live review pipeline, their own rules enforced at merge time, and a dashboard they actually open. Here is the path in full, with what each day looks like and the decision you make on it.",
      "Days 1–2: install and observe. Install the VERCODE GitHub App on one repository and open a normal PR. Within two minutes you get a summary verdict, inline findings, and a check run — no configuration required; VERCODE detects your stack from the repo (more on that below). The team just watches: which findings do developers fix, dismiss, or ignore? That dismissal data is gold, because it tells you what your rules should be.",
      "Days 3–5: write the first rules. Take the three or four 'we never want this' patterns from the dismissal log — a raw PII log line, a missing timeout on a fetch, a testless endpoint handler — and express them as VERCODE rules, either as lint targets or as rule statements the AI checks. Preview each against your last fifty reviews so nobody gets surprised by the gate later. You make the call here: which rules are advisory (findings posted, merge allowed) and which are hard (the check fails).",
      "Days 6–7: turn the gate on. Add VERCODE's check to branch protection on the mainline, set required rules to blocking, and leave the rest advisory for one more cycle so the noise settles. Configure the confidence floor per team taste — most organizations run the 0.6 default; strict teams move to 0.75 rather than disabling rules, because the floor is the precision dial. Day 7 is the first merge that could not have happened without the pipeline passing, and it is the moment the team stops calling it 'the bot.'",
      "Days 8–10: expand and measure. Roll the App out to the next set of repositories, set repo-level rules where a service has stricter needs (payments, auth), and connect the dashboard to the morning stand-up: code health trend, open security findings, review latency, and the team's dismiss rate. By day 10 the org has a review pipeline, an enforced ruleset, a protected mainline, and a health score it can argue with numbers. The remaining work is ordinary policy work — new rules as new norms get decided — not setup work.",
      "The 10-day story is a claim about the friction budget, not a promise that policy is easy in ten days. What it does promise: a single owner, one repo on day 1, the first enforced merge on day 7, and by day 10 a system where 'the rules' have a location, a history, and a gate.",
    ],
  },
  {
    slug: "what-a-code-health-score-measures",
    title: "What a code health score actually measures",
    description:
      "The score is a weighted index over five measurable axes — not vibes: open findings, age, test coverage delta, complexity, and security exposure.",
    date: "2026-08-21",
    readingTime: "9 min read",
    tags: ["dashboard", "metrics"],
    body: [
      "Every team has been burned by a 'code health' number that no one can defend. VERCODE's health score is built the other way: five measurable axes, fixed weights, and a visible formula, so a score drop on Monday is a statement you can expand into its components by Tuesday. The score is an index — the point is trend and comparison between services, not the absolute number.",
      "The five axes are all computable from the review data VERCODE already collects. (1) Open findings: the weighted count of unfixed high and critical findings in the service, weighted by severity. (2) Finding age: how long open findings sit unfixed; a two-week-old security finding weighs more than a two-day-old one. (3) Coverage delta: whether the diff you just reviewed was tested — the static stage measures which changed lines are covered by the tests that ran, and uncovered changed lines are a health input. (4) Complexity drift: cyclomatic growth in the touched modules, flagged only above thresholds you set, so 'refactor this' has a number. (5) Security exposure: open findings in the security category with their risk weights, plus secret-scan results from the static pass.",
      "The weights are fixed and public: security exposure and open high/critical findings carry the most, coverage delta and complexity carry the middle, and advisory findings carry the least. A service at 92 and falling faster than a service at 78 and stable will surface in the dashboard's trend view, because the score is recomputed after every review and the trend line is kept per service for 12 months. The 12-month line matters: a rising trend with a 'fine' absolute number is the signal worth arguing about.",
      "What the score deliberately does not measure: style, naming, or anything the review rules already gate. It is not a scoreboard for teams and VERCODE shows no leaderboard — the score is per service, owned by whoever last touched the service, and the dashboard frames it that way. Use it to pick where to invest: fix the 20% of services carrying 80% of the open criticals, backport the coverage gap, pay down the complexity drift in the two hot modules.",
      "The practical workflow we recommend: open the health page in stand-up, look at the top three movers, expand the movers into the five axes, and assign the axis — the security axis goes to the person who owns that surface, the coverage axis to the owning team. The score exists to make that conversation two minutes long instead of two hours. That is the whole claim: a number you can decompose, in the service that owns it, within two minutes.",
    ],
  },
  {
    slug: "how-vercode-detects-your-stack",
    title: "Zero-config: how VERCODE detects your stack",
    description:
      "Before any model call, a deterministic detector pass reads your repo and picks the lint targets, review tasks, and file budgets for you.",
    date: "2026-08-07",
    readingTime: "7 min read",
    tags: ["architecture", "setup"],
    body: [
      "Zero-config is the most misunderstood promise in dev tooling. It does not mean 'VERCODE has no opinions'; it means 'the opinions are detected, shown to you, and overridable — so nothing blocks your first review.' Before VERCODE's first review on a repository, a deterministic detector pass reads the manifest files and the directory shape: package.json and lockfiles, pyproject.toml and requirements, go.mod, Cargo.toml, build.gradle. It also samples file paths and the import graph to find the one or two languages that actually carry the code, because polyglot repos are a thing and the detector refuses to average them.",
      "Detection has four outputs, all of which appear in the rules page before you ever commit. (1) The lint targets: your config wins. If you ship an eslint.config.js, VERCODE runs your config rather than inventing one; Semgrep rules are pulled from your .semgrep/ directory if present, otherwise from the language baseline. (2) The review tasks: the task router picks which model stage runs on which diff — a Go service gets the concurrency task, a TypeScript app gets the type-contract task — and the detector's read of your stack is what sets the default routing. (3) The file budget: reviews process a bounded slice of the diff (up to 100 changed files, highest-risk files first); the detector tunes the budget to how your repo actually changes — a monorepo with huge generated files gets them excluded from the budget automatically. (4) The context rules: 1-hop imports are pulled for every changed file; the detector flags generated directories, vendored code, and lockfiles so the model never wastes tokens reading them.",
      "Every detection result is a rule, not a fact: the rules page shows the detected stack ('TypeScript + Node, ESLint with your config, Semgrep baseline') and each item is editable. You can exclude a directory from review, raise the file budget, pin the task routing, or turn the whole thing into a static-only review for a repo where AI findings are pure noise. The override is stored as a normal repo-level rule, with the same history and precedence as anything else you write by hand — the detector's work is just the pre-filled draft of your ruleset.",
      "Why run the detector before the model at all? Because a deterministic read is cheap, repeatable, and auditable, and it shrinks the model's job to the part that needs it. The detector's outputs bound the diff, choose the lint targets, and route the tasks — the model then reviews a smaller, better-described problem. That ordering is also what keeps zero-config honest: when a detection is wrong, the wrongness is in a rule you can see and fix, not in a model's silent guess about your codebase.",
      "The result in practice: install the App on a repo you have never touched, open a PR, and the first review shows a header — 'Detected: TypeScript, Node 20, ESLint (your config), 60-file budget, concurrency + type-contract tasks' — and every line of it is a link to the rule that set it. Zero-config, then, is zero friction plus full leverage: the defaults are reasonable because they are derived from your repo, and they remain defaults because every one is one click from yours.",
    ],
  },
];
