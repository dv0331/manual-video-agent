import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "@google/genai", "unpdf", "pdf-lib"],
};

export default nextConfig;
