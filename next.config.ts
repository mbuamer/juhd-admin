import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.JUHD_LOCAL_ADMIN_QA === "1" ? ".next-admin-qa" : ".next",
};

export default nextConfig;
