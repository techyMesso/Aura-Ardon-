import { validateEnvVars } from "./lib/env-schema.mjs";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()"
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  }
];

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
          source: "/(.*)",
          headers: securityHeaders
        }
      ];
    }
  };
}
