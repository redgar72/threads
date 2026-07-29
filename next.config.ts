import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default proxy body buffer is 10MB; raise so video uploads reach the route.
    proxyClientMaxBodySize: "50mb",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
