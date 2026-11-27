import { validateEnvVars } from "./lib/env-schema.mjs";
import { buildSecurityHeaders } from "./lib/security-headers.mjs";

const securityHeaders = buildSecurityHeaders();

/** @type {(phase: string) => import('next').NextConfig} */
export default function createNextConfig(phase) {
  if (phase === "phase-production-build") {
    validateEnvVars(process.env);
  }

  const supabaseHostname = (() => {
    try {
      return process.env.NEXT_PUBLIC_SUPABASE_URL
        ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
        : null;
    } catch {
      return null;
    }
  })();

  return {
    output: "standalone",
    poweredByHeader: false,
    reactStrictMode: true,
    serverExternalPackages: ["@react-pdf/renderer", "web-push", "sharp"],
    images: {
      formats: ["image/avif", "image/webp"],
      remotePatterns: [
        {
          protocol: "https",
          hostname: "**.supabase.co",
          pathname: "/storage/v1/object/public/**"
        },
        {
          protocol: "https",
          hostname: "**.supabase.co"
        },
        ...(supabaseHostname && !supabaseHostname.endsWith(".supabase.co")
          ? [
              {
                protocol: "https",
                hostname: supabaseHostname,
                pathname: "/storage/v1/object/public/**"
              }
            ]
          : [])
      ]
    },
    async headers() {
      return [
        {
          source: "/admin-sw.js",
          headers: [
            { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
            { key: "Service-Worker-Allowed", value: "/admin" }
          ]
        },
        {
          source: "/(.*)",
          headers: securityHeaders
        }
      ];
    }
  };
}
