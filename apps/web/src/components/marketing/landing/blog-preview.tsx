import Link from "next/link";
import { blogPosts } from "@/lib/blog-data";
import { IconArrow } from "../icons";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function BlogPreview() {
  const posts = blogPosts.slice(0, 3);
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-[28px] font-bold tracking-[-0.01em] text-[hsl(var(--text-1))] sm:text-[34px]">
            Engineering notes from the team
          </h2>
        </div>
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--accent-color)] hover:underline"
        >
          Read blog
          <IconArrow width={16} height={16} />
        </Link>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="flex flex-col rounded-[10px] border border-[hsl(var(--line))] bg-[hsl(var(--panel))] p-6 transition-colors hover:border-[var(--accent-color)]"
          >
            <div className="flex items-center gap-2 text-[12px] text-[hsl(var(--text-3))]">
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              <span aria-hidden="true">·</span>
              <span>{post.readingTime}</span>
            </div>
            <h3 className="mt-3 text-[17px] font-semibold leading-snug text-[hsl(var(--text-1))]">
              <Link href={`/blog/${post.slug}`} className="hover:text-[var(--accent-color)]">
                {post.title}
              </Link>
            </h3>
            <p className="mt-2 flex-1 text-[14px] leading-relaxed text-[hsl(var(--text-2))]">
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
          </article>
        ))}
      </div>
    </section>
  );
}
