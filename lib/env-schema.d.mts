import type { z } from "zod";

export declare const publicEnvSchema: z.ZodObject<{
  NEXT_PUBLIC_SUPABASE_URL: z.ZodString;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.ZodString;
  NEXT_PUBLIC_SITE_URL: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}>;

export declare const serverEnvSchema: z.ZodObject<{
  NEXT_PUBLIC_SUPABASE_URL: z.ZodString;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.ZodString;
  NEXT_PUBLIC_SITE_URL: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  SUPABASE_SERVICE_ROLE_KEY: z.ZodString;
  ADMIN_EMAIL: z.ZodString;
  ORDER_STATUS_TOKEN_SECRET: z.ZodString;
  REVALIDATE_SECRET: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  CRON_SECRET: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  UPSTASH_REDIS_REST_URL: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  UPSTASH_REDIS_REST_TOKEN: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  SENTRY_DSN: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  RESEND_API_KEY: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  ORDER_NOTIFY_EMAIL: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  RESEND_FROM_EMAIL: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  VAPID_PRIVATE_KEY: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  VAPID_SUBJECT: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  AFRICAS_TALKING_SMS_ENABLED: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  AFRICAS_TALKING_API_KEY: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  AFRICAS_TALKING_USERNAME: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  AFRICAS_TALKING_SENDER_ID: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
  AFRICAS_TALKING_SANDBOX: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
}>;

export type ValidatedEnvVars = z.infer<typeof serverEnvSchema>;

export declare function validateEnvVars(env?: Record<string, string | undefined>): ValidatedEnvVars;

