import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  // Standalone output for PM2 deployment (self-contained .next/standalone/)
  output: 'standalone',

  // External packages that use native Node.js APIs
  serverExternalPackages: ['unified', 'remark-parse', 'remark-gfm'],
  outputFileTracingRoot: resolve(__dirname),
};

export default nextConfig;
