import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  value => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional()
);

const optionalUrl = z.preprocess(
  value => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().url().optional()
);

const optionalEmail = z.preprocess(
  value => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().email().optional()
);

const httpUrl = z
  .string()
  .trim()
  .url("Must be a valid URL (e.g. https://your-project.supabase.co)")
  .refine(
    val => val.startsWith("https://") || val.startsWith("http://"),
    "Must start with http:// or https://"
  );

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .trim()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_SITE_URL: optionalUrl,
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.preprocess(
    value => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .trim()
      .regex(/^\+?\d{8,15}$/, "NEXT_PUBLIC_WHATSAPP_NUMBER must be 8–15 digits")
      .optional()
  ),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalTrimmedString
});

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .trim()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  ADMIN_EMAIL: z
    .string()
    .trim()
    .email("ADMIN_EMAIL must be a valid email address"),
  ORDER_STATUS_TOKEN_SECRET: z
    .string()
    .trim()
    .min(16, "ORDER_STATUS_TOKEN_SECRET must be at least 16 characters"),
  REVALIDATE_SECRET: optionalTrimmedString,
  CRON_SECRET: optionalTrimmedString,
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalTrimmedString,
  SENTRY_DSN: optionalUrl,
  RESEND_API_KEY: optionalTrimmedString,
  ORDER_NOTIFY_EMAIL: optionalEmail,
  RESEND_FROM_EMAIL: optionalTrimmedString,
  VAPID_PRIVATE_KEY: optionalTrimmedString,
  VAPID_SUBJECT: optionalTrimmedString,
  AFRICAS_TALKING_SMS_ENABLED: optionalTrimmedString,
  AFRICAS_TALKING_API_KEY: optionalTrimmedString,
  AFRICAS_TALKING_USERNAME: optionalTrimmedString,
  AFRICAS_TALKING_SENDER_ID: optionalTrimmedString,
  AFRICAS_TALKING_SANDBOX: optionalTrimmedString
});

/**
 * Validates all required build/server environment variables using Zod.
 * Throws a clear, formatted Error listing every missing or invalid variable.
 */
export function validateEnvVars(env = process.env) {
  const result = serverEnvSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues
      .map(issue => {
        const key = issue.path.join(".") || "ENV";
        return `  - ${key}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(
      `Invalid or missing environment variables:\n${details}\n\nCheck .env.local.example and ensure all required variables are set.`
    );
  }

  return result.data;
}

