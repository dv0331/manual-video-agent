import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "@google/genai", "unpdf", "pdf-lib"],
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
