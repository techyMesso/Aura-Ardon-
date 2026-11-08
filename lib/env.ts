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

export const DEFAULT_SITE_URL = "https://aura-ardon.vercel.app";

export function getOptionalSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;

  if (!value || !value.trim()) {
    return null;
  }

  return normalizeSiteUrl(value);
}

export function getPublicSiteUrl() {
  return getOptionalSiteUrl() ?? DEFAULT_SITE_URL;
}

export function getSiteUrl(requestOrigin?: string) {
  const configuredSiteUrl = getOptionalSiteUrl();

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  if (requestOrigin) {
    return normalizeSiteUrl(requestOrigin);
  }

  return DEFAULT_SITE_URL;
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

export function getRevalidateSecret() {
  return process.env.REVALIDATE_SECRET?.trim() || null;
}

export function getUpstashRedisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

