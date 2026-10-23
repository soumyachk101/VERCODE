import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Cta } from "@/components/marketing/cta";
import { blogPosts } from "@/lib/blog-data";

export const metadata: Metadata = {
  title: "Blog — VERCODE",
  description:
    "Engineering notes from VERCODE: enforcing team rules on every commit, a 10-day setup walkthrough, what a code health score measures, and how zero-config stack detection works.",
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogIndexPage() {
  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--accent))]">
          Blog
        </span>
        <h1 className="mt-3 max-w-3xl text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-[hsl(var(--text-1))] sm:text-[44px]">
          Notes from the work behind a reviewer teams trust
        </h1>
        <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-[hsl(var(--text-2))]">
          Every post here is an engineering note: what VERCODE decided, why, and
          what it means for the pull request in front of you.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {blogPosts.map((post) => (
            <article
              key={post.slug}
              className="flex flex-col rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--panel))] p-6 transition-colors hover:border-[hsl(var(--accent))] sm:p-7"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[hsl(var(--text-3))]">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <span aria-hidden="true">·</span>
                <span>{post.readingTime}</span>
              </div>
              <h2 className="mt-3 text-[20px] font-semibold leading-snug text-[hsl(var(--text-1))]">
                <Link href={`/blog/${post.slug}`} className="hover:text-[hsl(var(--accent))]">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 flex-1 text-[15px] leading-relaxed text-[hsl(var(--text-2))]">
                {post.description}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-[4px] border border-[hsl(var(--line))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--text-3))]"
                  >
                    {tag}
                  </span>
                ))}
                <Link
                  href={`/blog/${post.slug}`}
                  className="ml-auto text-[13px] font-medium text-[hsl(var(--accent))] hover:underline"
                >
                  Read post →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Cta />
    </MarketingShell>
  );
}
