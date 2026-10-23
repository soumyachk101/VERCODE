import Link from "next/link";

// 404 (the not-found page): a minimal, on-token page — the VERCODE mark,
// the "Not found" verdict, and the recovery links (home, sign in, blog,
// changelog) so an unknown route is a designed surface, not a dead end.
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--ground)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "64px 24px",
        fontSize: 14,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: "var(--text)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            background: "var(--accent)",
            borderRadius: 4,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ width: 8, height: 8, background: "var(--ground)", borderRadius: 2 }} />
        </span>
        VERCODE
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div
          className="tabular"
          style={{
            fontSize: 40,
            fontWeight: 600,
            color: "var(--text)",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
          }}
        >
          Not found
        </div>
        <p className="finding-line" style={{ margin: 0, maxWidth: 380, textAlign: "center" }}>
          This page does not exist — the link is broken, moved, or never written.
        </p>
      </div>

      <nav
        aria-label="Recovery links"
        style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}
      >
        <Link href="/" style={linkStyle}>
          Home
        </Link>
        <Link href="/signin" style={linkStyle}>
          Sign in
        </Link>
        <Link href="/blog" style={linkStyle}>
          Blog
        </Link>
        <Link href="/changelog" style={linkStyle}>
          Changelog
        </Link>      </nav>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  color: "var(--muted)",
  textDecoration: "underline",
  textDecorationOffset: 4,
  textUnderlineOffset: 4,
  fontSize: 14,
};
