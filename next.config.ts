import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingIncludes: {
    "/*": [
      "./runs/**/*.json",
      "./synthetic-data/**/*.json",
      "./knowledge/embeddings.json",
    ],
  },
};

export default nextConfig;
