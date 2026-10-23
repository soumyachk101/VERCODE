import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Cta } from "@/components/marketing/cta";
import { blogPosts } from "@/lib/blog-data";

// The slugs are known at build time, so the whole blog pre-renders.
export const dynamicParams = false;

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Metadata {
  return { title: "Post — VERCODE Blog" };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) notFound();

  const related = blogPosts
    .filter((p) => p.slug !== slug)
    .slice(0, 2);

  return (
    <MarketingShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
        <nav className="text-[13px] text-[hsl(var(--text-3))]">
          <Link href="/" className="hover:text-[hsl(var(--text-1))]">
            Home
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/blog" className="hover:text-[hsl(var(--text-1))]">
            Blog
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-[hsl(var(--text-2))]">{post.title}</span>
        </nav>

        <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-[hsl(var(--text-3))]">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden="true">·</span>
          <span>{post.readingTime}</span>
        </div>
        <h1 className="mt-3 text-[30px] font-bold leading-[1.15] tracking-[-0.015em] text-[hsl(var(--text-1))] sm:text-[38px]">
          {post.title}
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[hsl(var(--text-2))]">
          {post.description}
        </p>
        <div className="mt-6 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-[4px] border border-[hsl(var(--line))] px-2.5 py-1 text-[12px] font-medium text-[hsl(var(--text-2))]"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-10 space-y-6 border-t border-[hsl(var(--line))] pt-10">
          {post.body.map((paragraph, i) => (
            <p key={i} className="text-[16px] leading-[1.75] text-[hsl(var(--text-2))]">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="mt-12 rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--panel))] p-6">
          <h2 className="text-[14px] font-semibold uppercase tracking-wider text-[hsl(var(--text-3))]">
            Keep reading
          </h2>
          <ul className="mt-4 space-y-4">
            {related.map((p) => (
              <li key={p.slug} className="text-[15px]">
                <Link href={`/blog/${p.slug}`} className="font-medium text-[hsl(var(--text-1))] hover:text-[hsl(var(--accent))]">
                  {p.title}
                </Link>
                <p className="mt-1 text-[13px] text-[hsl(var(--text-3))]">{p.readingTime}</p>
              </li>
            ))}
          </ul>
        </div>
      </article>

      <Cta />
    </MarketingShell>
  );
}
