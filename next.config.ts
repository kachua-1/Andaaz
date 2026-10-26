import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Sarvam SDK uses Node APIs (fs, ws); keep it out of the bundle and load it at runtime.
  serverExternalPackages: ["sarvamai"],
  // Pin the project root (a stray lockfile in a parent folder would otherwise be picked up).
  turbopack: { root: process.cwd() },
};

export default nextConfig;
