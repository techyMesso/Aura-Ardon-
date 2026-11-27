/**
 * Builds the strict Content-Security-Policy and security headers for Auro Ardon.
 * Allows:
 * - 'self'
 * - Supabase API & Storage (*.supabase.co + configured NEXT_PUBLIC_SUPABASE_URL origin)
 * - Vercel Analytics & Speed Insights (va.vercel-scripts.com, vitals.vercel-insights.com)
 * - wa.me links (form-action & link navigation)
 * Explicitly excludes Resend (strictly server-only).
 */
export function buildContentSecurityPolicy({
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
  isDev = process.env.NODE_ENV === "development"
} = {}) {
  let supabaseOrigin = null;
  let supabaseWsOrigin = null;

  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      supabaseOrigin = parsed.origin;
      const wsProto = parsed.protocol === "https:" ? "wss:" : "ws:";
      supabaseWsOrigin = `${wsProto}//${parsed.host}`;
    } catch {
      // Ignore malformed URL
    }
  }

  const imgSources = [
    "'self'",
    "data:",
    "blob:",
    "https://*.supabase.co",
    ...(supabaseOrigin && !supabaseOrigin.endsWith(".supabase.co")
      ? [supabaseOrigin]
      : [])
  ];

  const connectSources = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://va.vercel-scripts.com",
    "https://vitals.vercel-insights.com",
    ...(supabaseOrigin && !supabaseOrigin.endsWith(".supabase.co")
      ? [supabaseOrigin]
      : []),
    ...(supabaseWsOrigin && !supabaseWsOrigin.endsWith(".supabase.co")
      ? [supabaseWsOrigin]
      : [])
  ];

  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    "https://va.vercel-scripts.com",
    "https://vitals.vercel-insights.com"
  ];

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self' https://wa.me",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSources.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"])
  ];

  return directives.join("; ");
}

export function buildSecurityHeaders(options = {}) {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(options)
    },
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
}

