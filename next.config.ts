import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e builds into an isolated dir so they never poison the dev `.next`
  // cache (and vice versa) — see playwright.config.ts.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
