import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Cta } from "@/components/marketing/cta";
import { blogPosts } from "@/lib/blog-data";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) return {};
  return {
    title: `${post.title} — VERCODE Blog`,
    description: post.description,
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) notFound();

  const date = new Date(`${post.date}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <MarketingShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <Link
          href="/blog"
          className="text-[13px] font-medium text-[hsl(var(--text-3))] transition-colors hover:text-[var(--accent-color)]"
        >
          ← All posts
        </Link>
        <div className="mt-8 flex items-center gap-2 text-[13px] text-[hsl(var(--text-3))]">
          <time dateTime={post.date}>{date}</time>
          <span aria-hidden="true">·</span>
          <span>{post.readingTime}</span>
        </div>
        <h1 className="mt-5 text-[30px] font-bold leading-tight tracking-[-0.02em] text-[hsl(var(--text-1))] sm:text-[38px]">
          {post.title}
        </h1>
        <div className="mt-10 space-y-6">
          {post.body.map((para, i) => (
            <p key={i} className="text-[16px] leading-[1.75] text-[hsl(var(--text-2))]">
              {para}
            </p>
          ))}
        </div>
      </article>
      <Cta />
    </MarketingShell>
  );
}
