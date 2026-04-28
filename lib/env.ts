function getRequiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function normalizeSiteUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function hasPublicSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseEnv() {
  return {
    url: getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  };
}

export function getOptionalSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;

  if (!value) {
    return null;
  }

  return normalizeSiteUrl(value);
}

export function getSiteUrl(requestOrigin?: string) {
  const configuredSiteUrl = getOptionalSiteUrl();

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  if (isProduction()) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SITE_URL");
  }

  if (requestOrigin) {
    return normalizeSiteUrl(requestOrigin);
  }

  throw new Error("A request origin is required when NEXT_PUBLIC_SITE_URL is not configured.");
}

export function buildSiteUrl(pathname: string, requestOrigin?: string) {
  const siteUrl = getSiteUrl(requestOrigin);
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return `${siteUrl}${normalizedPath}`;
}

export function getAdminEmail() {
  return getRequiredEnv("ADMIN_EMAIL").toLowerCase();
}

export function getServiceRoleKey() {
  return getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getOrderStatusTokenSecret() {
  return getRequiredEnv("ORDER_STATUS_TOKEN_SECRET");
}
