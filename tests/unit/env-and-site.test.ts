import { describe, expect, it } from "vitest";

import { validateEnv } from "@/lib/env";
import {
  CURRENCY,
  DEFAULT_DELIVERY_ZONES,
  DEFAULT_SITE_URL,
  DEFAULT_STORE_CONFIG,
  resolveSiteUrl
} from "@/lib/site";
import { formatCurrency } from "@/lib/utils";

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_SUPABASE_URL: "https://scukquqkdivnodefqggf.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  ADMIN_EMAIL: "aura.ardoncompany@gmail.com",
  ORDER_STATUS_TOKEN_SECRET: "super-secret-token-at-least-16-chars",
  NEXT_PUBLIC_SITE_URL: "https://aura-ardon.vercel.app",
  NEXT_PUBLIC_WHATSAPP_NUMBER: "254718038825"
};

describe("Phase 0 foundations — env validation, SITE_URL, currency, and CONFIG", () => {
  it("validates a complete environment cleanly with Zod", () => {
    const validated = validateEnv(VALID_ENV);
    expect(validated.NEXT_PUBLIC_SUPABASE_URL).toBe(
      "https://scukquqkdivnodefqggf.supabase.co"
    );
    expect(validated.ADMIN_EMAIL).toBe("aura.ardoncompany@gmail.com");
  });

  it("throws a clear error listing missing or invalid environment variables", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "test",
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        ADMIN_EMAIL: "not-an-email",
        ORDER_STATUS_TOKEN_SECRET: "short"
      })
    ).toThrowError(/Invalid or missing environment variables:/);
  });

  it("resolves SITE_URL from NEXT_PUBLIC_SITE_URL, falls back to CONFIG, and never uses VERCEL_URL", () => {
    const previousVercelUrl = process.env.VERCEL_URL;
    try {
      process.env.VERCEL_URL = "ephemeral-preview-123.vercel.app";
      expect(resolveSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
      expect(resolveSiteUrl("")).toBe(DEFAULT_SITE_URL);
      expect(resolveSiteUrl("https://auroardon.co.ke/")).toBe(
        "https://auroardon.co.ke"
      );
    } finally {
      if (previousVercelUrl === undefined) {
        delete process.env.VERCEL_URL;
      } else {
        process.env.VERCEL_URL = previousVercelUrl;
      }
    }
  });

  it("formats currency with KES everywhere (never Ksh)", () => {
    expect(CURRENCY).toBe("KES");
    expect(formatCurrency(350)).toBe("KES 350");
    expect(formatCurrency(1250.5)).toBe("KES 1,250.50");
    expect(formatCurrency(350)).not.toMatch(/ksh/i);
  });

  it("exposes CONFIG defaults and all 16 delivery zones", () => {
    expect(DEFAULT_STORE_CONFIG.whatsapp_number).toBe("254718038825");
    expect(DEFAULT_STORE_CONFIG.free_delivery_threshold).toBe(3000);
    expect(DEFAULT_STORE_CONFIG.pending_auto_cancel_hours).toBe(48);
    expect(DEFAULT_DELIVERY_ZONES).toHaveLength(16);
    expect(DEFAULT_DELIVERY_ZONES.find(z => z.name === "CBD")?.fee).toBe(150);
    expect(
      DEFAULT_DELIVERY_ZONES.find(z => z.name === "Outside Nairobi (courier)")
    ).toMatchObject({ fee: 400, is_outside_nairobi: true });
  });
});

