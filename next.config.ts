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
    ".space-z.ai",
  ],
};

export default nextConfig;
