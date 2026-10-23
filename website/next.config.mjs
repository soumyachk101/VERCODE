/** @type {import('next').NextConfig} */
const nextConfig = {
  // The website is a public static export (TECHNICAL_ARCHITECTURE.md §1:
  // `output: export` — the 4th deployable, sibling to web/api/worker).
  output: "export",
  trailingSlash: true,
  // No client-side data fetching in P2 (TECHNICAL_ARCHITECTURE.md §4.2).
  images: { unoptimized: true },
  // The source uses NodeNext-style `.js`-suffixed import specifiers that
  // resolve to `.ts`/`.tsx` files (the monorepo's `verbatimModuleSyntax`
  // + `NodeNext` convention, `tsconfig.base.json`). Webpack's
  // `resolve.extensionAlias` maps the `.js` specifier to the real
  // `.ts`/`.tsx` file in the app build — `tsc` handles the same imports
  // under `moduleResolution: bundler` + `allowJs` (the `.js` → `.ts`
  // substitution), so the typecheck already passes.
  webpack: (config) => {
    config.resolve = config.resolve || {};
    // Keep the default file extensions (including `.css` / `.svg` etc.)
    // and prepend the `.js` → `.ts`/`.tsx` substitution.
    config.resolve.extensions = [
      ".js",
      ".ts",
      ".tsx",
      ".mjs",
      ".json",
      ".node",
      ".css",
      ".svg",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".ico",
      ".woff",
      ".woff2",
      ".ttf",
    ];
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".js"],
    };
    return config;
  },
};

export default nextConfig;
