import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Cta } from "@/components/marketing/cta";
import { blogPosts } from "@/lib/blog-data";

export const metadata: Metadata = {
  title: "Blog — VERCODE",
  description:
    "Engineering notes on building a code reviewer teams trust: how the pipeline works, how rules become gates, and how to onboard a team in ten days.",
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogPage() {
  return (
    <MarketingShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <h1 className="text-[32px] font-bold leading-tight tracking-[-0.02em] text-[hsl(var(--text-1))] sm:text-[40px]">
          Engineering notes
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-[hsl(var(--text-2))]">
          How the pipeline works, how rules become gates, and how to onboard a
          team — written by the engineers who build VERCODE.
        </p>

        <div className="mt-14 divide-y divide-[hsl(var(--line))]">
          {blogPosts.map((post) => (
            <article key={post.slug} className="py-10 first:pt-0">
              <div className="flex items-center gap-2 text-[13px] text-[hsl(var(--text-3))]">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <span aria-hidden="true">·</span>
                <span>{post.readingTime}</span>
              </div>
              <h2 className="mt-3 text-[22px] font-bold leading-snug tracking-[-0.01em] text-[hsl(var(--text-1))]">
                <Link
                  href={`/blog/${post.slug}`}
                  className="transition-colors hover:text-[var(--accent-color)]"
                >
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[hsl(var(--text-2))]">
                {post.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-[4px] border border-[hsl(var(--line))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--text-3))]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <Link
                href={`/blog/${post.slug}`}
                className="mt-5 inline-block text-[14px] font-medium text-[var(--accent-color)] transition-colors hover:underline"
              >
                Read post →
              </Link>
            </article>
          ))}
        </div>
      </div>
      <Cta />
    </MarketingShell>
  );
}
