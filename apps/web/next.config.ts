import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dirtyworks/shared"],
  // Keep the dev badge away from the speedometer (bottom-left).
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
