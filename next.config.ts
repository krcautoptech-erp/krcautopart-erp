import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/company-assets/**",
        protocol: "https",
      },
    ],
  },
  reactCompiler: true,
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
