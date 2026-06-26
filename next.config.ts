import type { NextConfig } from "next";

const isStaticExport = process.env.NEXT_EXPORT === "true";

const nextConfig: NextConfig = {
  // Use "output: export" only for local static builds (npm run build:static)
  // Vercel Git deploys run Next.js natively and don't need static export
  ...(isStaticExport ? { output: "export" as const } : {}),
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    ".vercel.app",
  ],

  // Generate source maps for client bundle (production).
  // These are uploaded to Bugsnag by scripts/bugsnag-upload-sourcemaps.mjs
  // in the postbuild step, then DELETED from the build output so they're
  // not served publicly (which would expose original source code).
  // Stack traces will still resolve in Bugsnag because the maps were uploaded.
  productionBrowserSourceMaps: true,

  // Expose Vercel system env vars to the client bundle.
  // Vercel provides these at build time but they're not NEXT_PUBLIC_-prefixed
  // by default, so Next.js doesn't include them in the client bundle.
  // We re-expose them here so bugsnag.ts can read them via process.env.*.
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || "",
    NEXT_PUBLIC_VERCEL_URL: process.env.VERCEL_URL || "",
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || "",
  },
};

export default nextConfig;
