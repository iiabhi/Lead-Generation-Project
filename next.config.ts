import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The API routes spawn these scripts and read the seed configs at runtime,
  // so they must be bundled with the serverless functions on Vercel.
  outputFileTracingIncludes: {
    "/api/*": [
      "./scripts/**/*",
      "./data/saas-conference-source-pages.json",
      "./data/open-lead-rss-sources.json",
      "./node_modules/dotenv/**/*",
      "./node_modules/papaparse/**/*",
      "./node_modules/jsonrepair/**/*",
      "./node_modules/@google/genai/**/*",
      "./node_modules/@vercel/blob/**/*",
    ],
  },
};

export default nextConfig;
