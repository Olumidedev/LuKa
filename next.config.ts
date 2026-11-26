import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

// Security headers applied to every route (Day-1 security baseline, BRD §5 v3.2).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera stays off until Push-to-Look ships; microphone is used by Cook Mode voice commands.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || new Date().toISOString().slice(0, 10),
  },
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
