import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
};

// Sentry configuration wrapper.
// All options are optional — if SENTRY_DSN is not set, Sentry is a no-op.
// Source maps upload only happens when SENTRY_AUTH_TOKEN is set (production deploys).
export default withSentryConfig(nextConfig, {
  // Only relevant when SENTRY_AUTH_TOKEN is set (Vercel production deploys)
  // Silent no-op otherwise
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps in production builds (free for small projects)
  // This allows seeing original TS code in Sentry stack traces
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Auto-insert Sentry tree-shaking markers
  // This removes Sentry init code from client bundles when disabled
  disableLogger: true,

  // Don't fail the build if Sentry upload fails (beta-friendly)
  silent: true,
});
