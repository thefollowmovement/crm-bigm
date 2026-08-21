import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Doit rester cohérent avec MAX_UPLOAD_MB et le max_size du Caddyfile
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
