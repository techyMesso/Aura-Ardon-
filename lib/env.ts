import {
  DEFAULT_SITE_URL,
  DEFAULT_WHATSAPP_NUMBER,
  buildCanonicalUrl,
  resolveSiteUrl
} from "@/lib/site";
import { publicEnvSchema, serverEnvSchema, validateEnvVars } from "@/lib/env-schema.mjs";

export { DEFAULT_SITE_URL, publicEnvSchema, serverEnvSchema };

export type ValidatedServerEnv = ReturnType<typeof validateEnvVars>;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): ValidatedServerEnv {
  return validateEnvVars(env);
}

function getRequiredEnv(key: string) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function hasPublicSupabaseEnv() {
  return publicEnvSchema
    .pick({
      NEXT_PUBLIC_SUPABASE_URL: true,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: true
    })
    .safeParse(process.env).success;
}

export function getSupabaseEnv() {
  const parsed = publicEnvSchema
    .pick({
      NEXT_PUBLIC_SUPABASE_URL: true,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: true
    })
    .safeParse(process.env);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const key = firstIssue?.path.join(".") || "SUPABASE";
    throw new Error(
      `Invalid or missing environment variable ${key}: ${firstIssue?.message ?? "Required"}`
    );
  }

  return {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
}

export function getOptionalSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getPublicSiteUrl() {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}

export function getSiteUrl(requestOrigin?: string) {
  const configuredSiteUrl = getOptionalSiteUrl();

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  if (requestOrigin) {
    return requestOrigin.trim().replace(/\/+$/, "");
  }

  return DEFAULT_SITE_URL;
}

export function buildSiteUrl(pathname: string, requestOrigin?: string) {
  return buildCanonicalUrl(pathname, getSiteUrl(requestOrigin));
}

export function getWhatsAppNumber() {
  const configured = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim();
  return configured || DEFAULT_WHATSAPP_NUMBER;
}

export function getAdminEmail() {
  const parsed = serverEnvSchema.shape.ADMIN_EMAIL.safeParse(process.env.ADMIN_EMAIL);
  if (!parsed.success) {
    throw new Error(
      `Invalid or missing environment variable ADMIN_EMAIL: ${parsed.error.issues[0]?.message ?? "Required"}`
    );
  }
  return parsed.data.toLowerCase();
}

export function getServiceRoleKey() {
  return getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getOrderStatusTokenSecret() {
  const parsed = serverEnvSchema.shape.ORDER_STATUS_TOKEN_SECRET.safeParse(
    process.env.ORDER_STATUS_TOKEN_SECRET
  );
  if (!parsed.success) {
    throw new Error(
      `Invalid or missing environment variable ORDER_STATUS_TOKEN_SECRET: ${parsed.error.issues[0]?.message ?? "Required"}`
    );
  }
  return parsed.data;
}

export function getRevalidateSecret() {
  return process.env.REVALIDATE_SECRET?.trim() || null;
}

export function getCronSecret() {
  return process.env.CRON_SECRET?.trim() || null;
}

export function getUpstashRedisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

export function getResendEnv() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const toEmail = process.env.ORDER_NOTIFY_EMAIL?.trim();
  if (!apiKey || !toEmail) {
    return null;
  }
  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() || "Auro Ardon <onboarding@resend.dev>";
  return { apiKey, toEmail, fromEmail };
}

export function getWebPushVapidEnv() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    return null;
  }
  const fallbackEmail =
    process.env.ORDER_NOTIFY_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "admin@aura-ardon.vercel.app";
  const subject = process.env.VAPID_SUBJECT?.trim() || `mailto:${fallbackEmail}`;
  return { publicKey, privateKey, subject };
}

export function getAfricasTalkingSmsEnv() {
  const enabledFlag =
    (process.env.AFRICAS_TALKING_SMS_ENABLED?.trim().toLowerCase() ?? "false") ===
    "true";
  const apiKey = process.env.AFRICAS_TALKING_API_KEY?.trim() || null;
  const username = process.env.AFRICAS_TALKING_USERNAME?.trim() || null;
  const senderId = process.env.AFRICAS_TALKING_SENDER_ID?.trim() || null;
  const sandbox =
    (process.env.AFRICAS_TALKING_SANDBOX?.trim().toLowerCase() ?? "") === "true" ||
    username?.toLowerCase() === "sandbox";

  return {
    enabledFlag,
    configured: Boolean(apiKey && username),
    apiKey,
    username,
    senderId,
    sandbox
  };
}
