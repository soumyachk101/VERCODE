/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker-friendly: a single self-contained server.js (M6, T6.3)
  output: "standalone",
  // NEXT_PUBLIC_API_BASE is inlined at build time (the API base from env,
  // default http://localhost:4000 in lib/api.ts). The .env.local /
  // .env.local.example placeholders keep the build green in CI.
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE,
  },
};

export default nextConfig;
