import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the parent home directory confuses Next.js's
  // workspace-root auto-detection — pin it explicitly to this project.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Produces .next/standalone — a self-contained build (traced node_modules
  // + a minimal server.js) sized for container deployment, so the runtime
  // image doesn't need `npm install` or the full node_modules tree at all.
  // See Dockerfile.
  output: "standalone",
};

export default nextConfig;
