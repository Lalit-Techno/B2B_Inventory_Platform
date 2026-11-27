import type { NextConfig } from "next";

// The browser only talks to this origin; /api/v1/* is proxied to the backend,
// so the refresh cookie is first-party (works on Vercel + Render too).
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
