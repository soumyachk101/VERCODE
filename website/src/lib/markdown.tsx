/**
 * VERCODE website — dependency-free markdown renderer + front-matter reader.
 *
 * The supported subset is the CommonMark core the content/ posts actually
 * use: `##`/`###` headings, paragraphs, fenced ``` code blocks, inline
 * `code` / **bold** / *italic* / [text](url) links, `- ` and `1.` lists,
 * `> ` blockquotes, and `---` horizontal rules.
 *
 * Two exported entry points:
 *   - `renderMarkdown(md, { baseHref? })` → `{ html, toc, headings }`
 *     The string-HTML + TOC variant (the docs/TOC pages + the schema
 *     generator's headline pass use it). No React, no DOM — it is safe to
 *     import from both RSC and client components in the static export.
 *   - `renderMarkdownToReact(md)` → `ReactNode[]`
 *     The React-node variant (the blog + changelog SSG bodies). Each node
 *     carries a `key`; the caller drops the array into the 720px reading
 *     column.
 *   - `parseFrontMatter(raw)` → `{ front, body }`
 *     The flat YAML-subset front-matter parser (scalars, arrays, booleans);
 *     no yaml dependency — the strict Zod gate in CI is the schema check,
 *     this is the build-time read.
 */
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Slugify a heading to a kebab-case id (lowercase, spaces → dashes, strip
 *  anything that is not alnum or a dash). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/** Resolve a relative link to baseHref + path; absolute links pass through. */
function resolveHref(href: string, baseHref?: string): string {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  if (!baseHref) return href;
  const b = baseHref.replace(/\/$/, "");
  const h = href.startsWith("/") ? href : `/${href}`;
  return `${b}${h}`;
}

/** Escape a raw string, then apply **bold**, *italic*, `code`, [text](url). */
function escapeAndInline(text: string, baseHref?: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/`([^`]+)`/g, '<code class="mono">$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, txt, url) => {
    return `<a href="${resolveHref(url, baseHref)}">${txt}</a>`;
  });
  return s;
}

/** Split a markdown table row (`| a | b |`) into trimmed cell strings. */
function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Detect a table: the line is a pipe row and the next line is the
 *  `| --- | --- |` separator. Returns the row's cells, or null. */
function isTableRow(line: string): boolean {
  return /^\s*\|/.test(line) && line.includes("|");
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

/**
 * Emit a GFM table (a real `<table>` with a caption + scope, the
 * SEO_AEO_GEO.md "a table is the most quotable format" rule). The
 * header row becomes `<th scope="col">`; body rows are `<td>`. The
 * machine-readable format (the /docs quotas + pricing tables) is what
 * makes the AEO-extractable numbers quotable.
 */
function renderTable(
  lines: string[],
  i: number,
  baseHref?: string,
): { html: string; next: number } {
  const headerCells = splitTableRow(lines[i]);
  // i points at the header; i+1 is the separator; consume both.
  let next = i + 2;
  const bodyRows: string[][] = [];
  while (next < lines.length && isTableRow(lines[next])) {
    bodyRows.push(splitTableRow(lines[next]));
    next += 1;
  }
  const colCount = headerCells.length;
  const head = headerCells
    .map((c) => `<th scope="col">${escapeAndInline(c, baseHref)}</th>`)
    .join("");
  const body = bodyRows
    .map(
      (r) =>
        `<tr>${Array.from({ length: colCount }, (_, ci) =>
          `<td>${escapeAndInline(r[ci] ?? "", baseHref)}</td>`,
        ).join("")}</tr>`,
    )
    .join("\n");
  // A generic, non-decorative caption: the column headers, so a
  // screen-reader + answer engine know what the table is.
  const caption = headerCells.join(", ");
  const html = `<div class="table-wrap"><table><caption>${escapeHtml(
    caption,
  )}</caption><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table></div>`;
  return { html, next };
}

// ---------------------------------------------------------------------------
// parseFrontMatter
// ---------------------------------------------------------------------------

export interface FrontMatter {
  [key: string]: string | boolean | string[];
}

/**
 * Parse a `---`-fenced front-matter block at the top of a Markdown file.
 * Supports `key: value` strings, `key: [a, b]` arrays, and
 * `key: true/false` booleans. No yaml dependency.
 *
 * Returns `{ front, body }` — `front` is the parsed map (empty when the
 * source has no front-matter block), `body` is the remaining markdown.
 */
export function parseFrontMatter(raw: string): {
  front: FrontMatter;
  body: string;
} {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return { front: {}, body: raw };

  const front: FrontMatter = {};
  let i = 1;
  while (i < lines.length && lines[i].trim() !== "---") {
    const l = lines[i].trim();
    if (l === "" || l.startsWith("#")) {
      i += 1;
      continue;
    }
    const m = l.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (m) {
      const key = m[1];
      const val = m[2].trim();
      if (val === "true") front[key] = true;
      else if (val === "false") front[key] = false;
      else if (val.startsWith("[") && val.endsWith("]")) {
        front[key] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter((s) => s.length > 0);
      } else {
        front[key] = val.replace(/^["']|["']$/g, "");
      }
    }
    i += 1;
  }

  const body = lines.slice(i + 1).join("\n");
  return { front, body };
}

// ---------------------------------------------------------------------------
// renderMarkdown (the string + TOC variant)
// ---------------------------------------------------------------------------

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export interface RenderResult {
  html: string;
  toc: TocEntry[];
  headings: { id: string; text: string }[];
}

/**
 * Render a Markdown body to an HTML string + a TOC (headings with slugs).
 * The `baseHref` option prefixes any relative link target with the site
 * origin, which is how the static export's cross-page links stay absolute.
 *
 * The supported blocks: `##`/`###` headings, paragraphs, fenced ``` code
 * blocks, unordered/ordered lists (one nesting level via 2-space indent),
 * `>` blockquotes, `---` horizontal rules. Inline: `code`, **bold**,
 * *italic*, [text](url) — relative links resolve to baseHref + path.
 */
export function renderMarkdown(
  md: string,
  opts?: { baseHref?: string },
): RenderResult {
  const baseHref = opts?.baseHref;
  const lines = md.split("\n");
  const html: string[] = [];
  const toc: TocEntry[] = [];
  const headings: { id: string; text: string }[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
    if (line.trimStart().startsWith("```")) {
      i += 1;
      const buf: string[] = [];
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // consume the closing fence
      html.push(
        `<pre class="code-block"><code>${escapeHtml(buf.join("\n"))}</code></pre>`,
      );
      continue;
    }

    // H2 / H3 headings.
    if (line.startsWith("### ")) {
      const text = line.slice(4).trim();
      const id = slugify(text);
      html.push(`<h3 id="${id}">${escapeAndInline(text, baseHref)}</h3>`);
      toc.push({ id, text, level: 3 });
      headings.push({ id, text });
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3).trim();
      const id = slugify(text);
      html.push(`<h2 id="${id}">${escapeAndInline(text, baseHref)}</h2>`);
      toc.push({ id, text, level: 2 });
      headings.push({ id, text });
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^-{3,}\s*$/.test(line)) {
      html.push("<hr>");
      i += 1;
      continue;
    }

    // Unordered list.
    if (line.trimStart().startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("- ")) {
        items.push(
          `  <li>${escapeAndInline(
            lines[i].trimStart().replace(/^- ?/, ""),
            baseHref,
          )}</li>`,
        );
        i += 1;
      }
      html.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    // Ordered list.
    if (/^\d+\.\s/.test(line.trimStart())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trimStart())) {
        items.push(
          `  <li>${escapeAndInline(
            lines[i].trimStart().replace(/^\d+\.\s+/, ""),
            baseHref,
          )}</li>`,
        );
        i += 1;
      }
      html.push(`<ol>\n${items.join("\n")}\n</ol>`);
      continue;
    }

    // Blockquote.
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i += 1;
      }
      html.push(
        `<blockquote>${escapeAndInline(buf.join(" "), baseHref)}</blockquote>`,
      );
      continue;
    }

    // Blank line → skip.
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Pipe table: a `|` row followed by a `| --- |` separator.
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const { html: tableHtml, next } = renderTable(lines, i, baseHref);
      html.push(tableHtml);
      i = next;
      continue;
    }

    // Paragraph: consume until a blank line or a block-starting line.
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{2,3} |[-]\s|\d+\.\s|> |```|-{3,}\s*$)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${escapeAndInline(buf.join(" "), baseHref)}</p>`);
  }

  return { html: html.join("\n"), toc, headings };
}

// ---------------------------------------------------------------------------
// The React-node variant (the blog / changelog SSG bodies)
// ---------------------------------------------------------------------------

/** Parse inline Markdown into React nodes. One recursive pass over the
 *  backtick segments first, then bold/italic/links within each segment. */
function parseInline(
  text: string,
  keyPrefix: string,
  baseHref?: string,
): ReactNode[] {
  const out: ReactNode[] = [];
  const segments = text.split("`");
  segments.forEach((seg, si) => {
    if (si > 0) {
      out.push(
        <code
          key={`${keyPrefix}-code-${si}`}
          className="mono"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {seg}
        </code>,
      );
    }
    if (si % 2 === 0) {
      out.push(...parseRich(seg, `${keyPrefix}-r-${si}`, baseHref));
    }
  });
  return out;
}

/** Parse **bold**, *italic*, and [text](url) within a plain-text segment. */
function parseRich(
  text: string,
  keyPrefix: string,
  baseHref?: string,
): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b-${m.index}`}>
          {parseRich(m[1], `${keyPrefix}-bi-${m.index}`, baseHref)}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      out.push(
        <em key={`${keyPrefix}-i-${m.index}`}>
          {parseRich(m[2], `${keyPrefix}-ii-${m.index}`, baseHref)}
        </em>,
      );
    } else {
      out.push(
        <a key={`${keyPrefix}-a-${m.index}`} href={resolveHref(m[4], baseHref)}>
          {m[3]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Render a Markdown body to a React node array (the SSG page's body
 * renderer). Each node carries a `key`; the caller drops the result into
 * the 720px reading column. `baseHref` prefixes relative link targets.
 *
 * The headings carry a stable slug id (the blog page's TOC anchors point
 * at these; matches the string variant's slugify).
 */
export function renderMarkdownToReact(
  source: string,
  baseHref?: string,
): ReactNode[] {
  const lines = source.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const nextKey = () => `${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // consume the closing fence
      out.push(
        <pre key={nextKey()} className="code-block">
          <code data-lang={lang || undefined}>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // H2 / H3 headings (with a stable slug id — the blog page's TOC
    // anchors point at these).
    if (line.startsWith("### ")) {
      const label = line.slice(4).trim();
      out.push(
        <h3 key={nextKey()} id={slugify(label)}>
          {parseInline(label, nextKey(), baseHref)}
        </h3>,
      );
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      const label = line.slice(3).trim();
      out.push(
        <h2 key={nextKey()} id={slugify(label)}>
          {parseInline(label, nextKey(), baseHref)}
        </h2>,
      );
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^-{3,}\s*$/.test(line)) {
      out.push(<hr key={nextKey()} />);
      i += 1;
      continue;
    }

    // Unordered list.
    if (line.trimStart().startsWith("- ")) {
      const items: ReactNode[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("- ")) {
        items.push(
          <li key={`li-${i}`}>
            {parseInline(
              lines[i].trimStart().replace(/^- ?/, ""),
              `li-${i}`,
              baseHref,
            )}
          </li>,
        );
        i += 1;
      }
      out.push(<ul key={nextKey()}>{items}</ul>);
      continue;
    }

    // Ordered list.
    if (/^\d+\.\s/.test(line.trimStart())) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trimStart())) {
        items.push(
          <li key={`oli-${i}`}>
            {parseInline(
              lines[i].trimStart().replace(/^\d+\.\s+/, ""),
              `oli-${i}`,
              baseHref,
            )}
          </li>,
        );
        i += 1;
      }
      out.push(<ol key={nextKey()}>{items}</ol>);
      continue;
    }

    // Blockquote.
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i += 1;
      }
      out.push(
        <blockquote key={nextKey()}>
          {parseInline(buf.join(" "), nextKey(), baseHref)}
        </blockquote>,
      );
      continue;
    }

    // Blank line → skip.
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Pipe table: a `|` row followed by a `| --- |` separator.
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = splitTableRow(lines[i]);
      let next = i + 2;
      const bodyRows: string[][] = [];
      while (next < lines.length && isTableRow(lines[next])) {
        bodyRows.push(splitTableRow(lines[next]));
        next += 1;
      }
      out.push(
        <div key={nextKey()} className="table-wrap">
          <table>
            <caption>{headerCells.join(", ")}</caption>
            <thead>
              <tr>
                {headerCells.map((c, ci) => (
                  <th key={ci} scope="col">
                    {parseInline(c, `${ci}-th`, baseHref)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{parseInline(c, `${ri}-${ci}-td`, baseHref)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i = next;
      continue;
    }

    // Paragraph: consume until a blank line or a block-starting line.
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{2,3} |[-]\s|\d+\.\s|> |```|-{3,}\s*$)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={nextKey()}>
        {parseInline(buf.join(" "), nextKey(), baseHref)}
      </p>,
    );
  }

  return out;
}
