import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the parent home directory confuses Next.js's
  // workspace-root auto-detection — pin it explicitly to this project.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
