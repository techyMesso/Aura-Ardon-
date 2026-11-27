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
  sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN,
  isDev = process.env.NODE_ENV === "development",
  upgradeInsecureRequests = process.env.CSP_DISABLE_UPGRADE_INSECURE !== "1"
} = {}) {
  let supabaseOrigin = null;
  let supabaseWsOrigin = null;
  let sentryOrigin = null;

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

  if (sentryDsn) {
    try {
      sentryOrigin = new URL(sentryDsn).origin;
    } catch {
      // Ignore malformed Sentry DSN
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
      : []),
    ...(sentryOrigin ? [sentryOrigin] : [])
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
    ...(!isDev && upgradeInsecureRequests ? ["upgrade-insecure-requests"] : [])
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

