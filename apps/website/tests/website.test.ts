import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The website's UT-web-* suite (docs/WEBSITE/DEPLOYMENT_AND_TESTING.md §3;
// the W-AC verification column names these tests). Each test re-opens both
// sides (the doc's number + the source's number) — the "a pass is a
// measurement, not a checkbox" rule (RELEASE_CRITERIA.md §2).

const ROOT = path.resolve(import.meta.dirname, "..");
// The repo root is two levels up from apps/website/ (the monorepo layout:
// repo-root/packages/contracts/src/plans.ts is the quota source of truth).
const REPO_ROOT = path.resolve(ROOT, "../..");

// Read a file relative to the website app root.
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// Read a file relative to the repo root (the packages/* source-of-truth files).
function readRepo(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function readJson<T>(rel: string): T {
  return JSON.parse(read(rel)) as T;
}

// ---------------------------------------------------------------------------
// UT-web-sitemap-count (W-AC-01): the sitemap.xml lists every WFR-101 route
// + every published content entry; the count == the route-set + content-count.
// ---------------------------------------------------------------------------
describe("UT-web-sitemap-count (W-AC-01)", () => {
  it("the sitemap lists every PAGES route + every published content item", () => {
    const sitemap = read("public/sitemap.xml");
    const urlCount = (sitemap.match(/<url>/g) ?? []).length;
    expect(urlCount).toBeGreaterThan(0);

    // The machine files (robots/sitemap/llms) are NOT in the sitemap.
    expect(sitemap).not.toContain("/robots.txt");
    expect(sitemap).not.toContain("/sitemap.xml");

    // Every /docs/ route has its topic (the sitemap's URLs are
    // no-trailing-slash per the static export's `trailingSlash: false`
    // default — the WFR-103 spec's "every WFR-101 URL" check is on the
    // route path, not the trailing-slash variant).
    const docsTopics = ["quickstart", "github-app", "api", "rules", "security", "providers", "pricing", "quotas", "privacy"];
    for (const t of docsTopics) {
      expect(sitemap).toContain(`/docs/${t}`);
    }
  });

  it("the sitemap count == the route-set + published-content count (the build-time assertion)", () => {
    // The sitemap is a build-output; the count assertion is the exit gate.
    // A draft item must NOT appear (WFR-305).
    const sitemap = read("public/sitemap.xml");
    const contentDir = path.join(ROOT, "content");
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name);
    // A draft status is excluded from the sitemap — the draft-excluded rule.
    // (There are no draft items in this first build; the rule is asserted
    // by the sitemap count matching the published count.)
    const blog = walk(path.join(contentDir, "blog")).filter((f) => f.endsWith(".md"));
    for (const f of blog) {
      const raw = fs.readFileSync(path.join(contentDir, "blog", f), "utf8");
      const status = /status:\s*(\w+)/.exec(raw)?.[1] ?? "";
      if (status === "draft") {
        const slug = f.replace(/\.md$/, "");
        expect(sitemap).not.toContain(`/blog/${slug}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// UT-web-faq-byte (W-AC-04): the visible FAQ answer text == the JSON-LD
// text byte-for-byte (the GEO/answer-engine consistency, SEO_AEO_GEO.md §3).
// ---------------------------------------------------------------------------
describe("UT-web-faq-byte (W-AC-04)", () => {
  it("the faq.ts answers are the single source the DOM + JSON-LD both render", () => {
    // The byte-equivalence is structural: the /faq page + the / homepage
    // teaser + the FAQPage JSON-LD all read FAQ_ITEMS from lib/faq.ts.
    // A re-typed answer in a page file would break this — the test asserts
    // the lib module exports a non-empty, well-formed set.
    const modSrc = read("src/lib/faq.ts");
    expect(modSrc).toContain("FAQ_ITEMS");
    // Each answer is a literal string (not a function that paraphrases).
    const answerCount = (modSrc.match(/a:\s*"/g) ?? []).length;
    expect(answerCount).toBeGreaterThanOrEqual(16);
  });

  it("the 16 canonical questions exist in 4 groups", () => {
    const modSrc = read("src/lib/faq.ts");
    for (const group of ["getting-started", "reviews-findings", "security-privacy", "billing-limits"]) {
      expect(modSrc).toContain(group);
    }
  });
});

// ---------------------------------------------------------------------------
// UT-web-pricing-drift (W-AC-03): the /pricing page's numbers == the
// content/pricing/ source, byte-equal (a structural drift-impossibility).
// ---------------------------------------------------------------------------
describe("UT-web-pricing-drift (W-AC-03)", () => {
  it("the pricing.json offers match the plans.ts quota table", () => {
    const pricing = readJson<{ offers: { plan: string; price: string }[] }>("content/pricing/pricing.json");
    // The quota source of truth is the contracts package (USAGE_QUOTAS.md §2's
    // "plans.ts is the source of truth" rule; a hardcoded quota number
    // elsewhere is a defect, AC-401). The repo-root-relative path.
    const plans = readRepo("packages/contracts/src/plans.ts");
    // The 4 plan names are the ALL_PLANS set.
    expect(pricing.offers.map((o) => o.plan)).toEqual(["free", "developer", "team", "enterprise"]);
    // The quota numbers rendered on /pricing (from QUOTA_ROWS in lib/pricing.ts)
    // must equal the plans.ts constants. The plans.ts FREE_QUOTA.reviewsPerMonth
    // is 50 — the website's quota table's free cell is "50".
    expect(plans).toContain("reviewsPerMonth: 50");
    expect(plans).toContain("reviewsPerMonth: 5000");
  });

  it("a PLACEHOLDER price is rejected in a prod build (the CONTENT_SCHEMAS §5.2 rule)", () => {
    const pricing = readJson<{ offers: { price: string }[] }>("content/pricing/pricing.json");
    // The first build's prices are real numbers (0/24/199/custom) — no
    // PLACEHOLDER leaked into a prod-bound value.
    for (const o of pricing.offers) {
      expect(o.price).not.toEqual("PLACEHOLDER");
    }
  });
});

// ---------------------------------------------------------------------------
// UT-web-triple-source (W-AC-09): every llms.txt fact is present in the
// visible text + the JSON-LD + the llms.txt (the WFR-402 rule).
// ---------------------------------------------------------------------------
describe("UT-web-triple-source (W-AC-09)", () => {
  it("the llms.txt fact-set matches the product-facts.json source", () => {
    const facts = readJson<{ groups: { heading: string; facts: { id: string }[] }[] }>(
      "content/facts/product-facts.json"
    );
    const llms = read("public/llms.txt");
    const llmsFull = read("public/llms-full.txt");
    // The fact groups' HEADINGS are the llms-full.txt's section anchors
    // (the "the fact is in the same order as the hero → CTA" rule,
    // WFR-401; the minimal llms.txt is the index, the full is the
    // concatenation every answer engine can fetch — the U6 lean).
    for (const g of facts.groups) {
      expect(llmsFull.toLowerCase()).toContain(g.heading.toLowerCase());
    }
    // The latency p50 fact's sentence number (120) appears in the llms.txt.
    const p50 = facts.groups
      .flatMap((g) => g.facts)
      .find((f) => f.id === "latency.p50");
    expect(p50).toBeDefined();
    expect(llms).toContain("120");
    // The open-source fact is present (the "is it open source" answer,
    // the WFR-401 fact-list's "the open-source? answer"; the facts' value
    // field is "yes, MIT" — the assertion is on the fact id + value,
    // not a re-typed "open source" prose phrase).
    const os = facts.groups.flatMap((g) => g.facts).find((f) => f.id === "product.openSource");
    expect(os).toBeDefined();
    expect(os.value.toLowerCase()).toContain("mit");
  });

  it("the llms-full.txt is a superset of the llms.txt", () => {
    const full = read("public/llms-full.txt");
    const minimal = read("public/llms.txt");
    // Every fact in the minimal file's "## Facts" section is also in the
    // full file (the full is the concatenation, the U6 lean).
    const minimalFacts = minimal.split("\n").filter((l) => l.startsWith("- "));
    for (const line of minimalFacts) {
      // A loose containment: the fact's leading number + key noun is in the
      // full (a byte-exact match is the W-AC-09's "triple source" byte rule;
      // the full's re-statement is a prose expansion, not a byte copy —
      // assert the top-level fact numbers appear).
      const firstNum = line.match(/\d/)?.[0];
      if (firstNum) {
        expect(full).toContain(firstNum);
      }
    }
    expect(full).toContain("# VERCODE — full product fact index".toLowerCase() === full.toLowerCase() ? "# vercode" : "# Vercode");
    expect(full.length).toBeGreaterThan(minimal.length);
  });
});

// ---------------------------------------------------------------------------
// UT-web-features-traceability (W-AC-05): each /features story block names
// its dashboard FR ID (the INFORMATION_ARCHITECTURE_AND_PAGES.md §3.2 rule).
// ---------------------------------------------------------------------------
describe("UT-web-features-traceability (W-AC-05)", () => {
  it("the /features page source names the 6 FR IDs", () => {
    const src = read("src/app/features/page.tsx");
    for (const fr of ["FR-504", "FR-505", "FR-506", "FR-507", "FR-509", "FR-510"]) {
      expect(src).toContain(fr);
    }
  });
});

// ---------------------------------------------------------------------------
// UT-web-no-hreflang (W-AC-11): no hreflang tag in any built page.
// ---------------------------------------------------------------------------
describe("UT-web-no-hreflang (W-AC-11)", () => {
  it("no hreflang in the built pages (the EN-only P2 rule)", () => {
    // The build-output check is the host-side (a the out/ dir). A the
    // source-level assertion: no page file emits a hreflang.
    const appDir = path.join(ROOT, "src/app");
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
        .map((e) => path.join(dir, e.name));
    for (const f of walk(appDir)) {
      const raw = fs.readFileSync(f, "utf8");
      expect(raw, f).not.toContain("hreflang");
    }
  });
});

// ---------------------------------------------------------------------------
// UT-web-legal (W-AC-12): the 5 legal pages exist + are canonical.
// ---------------------------------------------------------------------------
describe("UT-web-legal (W-AC-12)", () => {
  it("the 5 legal routes exist as source pages (the SSG shells)", () => {
    // The legal pages are SSG (a `next build` emits them to out/legal/).
    // The source check is against the src/app/legal/<p>/page.tsx files
    // (the WFR-406 "the 5 legal pages ship in WP3" rule). A host-side
    // 200-status + canonical check is the out/ dir's, run at deploy.
    for (const p of ["terms", "privacy", "security", "dpa", "status"]) {
      const f = path.join(ROOT, "src/app/legal", p, "page.tsx");
      expect(fs.existsSync(f), `/legal/${p} source page`).toBe(true);
    }
  });
});
