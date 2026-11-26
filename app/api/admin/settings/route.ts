import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getStoreSettings, saveStoreSettings } from "@/lib/data";
import {
  getAfricasTalkingSmsEnv,
  getResendEnv,
  getWebPushVapidEnv
} from "@/lib/env";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/site";
import type { StoreSettingsUpdate } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const templateFieldSchema = z.string().trim().min(5, "Template cannot be empty.").max(1000);

const updateSettingsSchema = z.object({
  site_name: z.string().trim().min(2).max(120).optional(),
  business_phone: z.string().trim().min(7).max(32).optional(),
  business_email: z.string().trim().email().nullable().optional().or(z.literal("")),
  business_address: z.string().trim().min(2).max(240).optional(),
  kra_pin: z.string().trim().max(40).nullable().optional(),
  whatsapp_number: z.string().trim().min(8).max(24).optional(),
  business_hours: z.string().trim().min(2).max(160).optional(),
  same_day_cutoff: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, "Use HH:MM format (e.g. 14:00).")
    .optional(),
  pending_auto_cancel_hours: z.coerce.number().int().min(1).max(336).optional(),
  low_stock_default: z.coerce.number().int().min(0).max(500).optional(),
  free_delivery_threshold: z.coerce.number().min(0).max(1_000_000).optional(),
  instagram_url: z.string().trim().max(240).optional(),
  tiktok_url: z.string().trim().max(240).optional(),
  is_store_open: z.boolean().optional(),
  holiday_banner_message: z.string().trim().max(400).optional(),
  invoice_footer: z.string().trim().max(500).optional(),
  payment_instructions: z.string().trim().max(500).optional(),
  sms_notifications_enabled: z.boolean().optional(),
  message_templates: z
    .object({
      confirmed: templateFieldSchema.optional(),
      dispatched: templateFieldSchema.optional(),
      delivered: templateFieldSchema.optional(),
      cancelled: templateFieldSchema.optional(),
      unpaid_reminder: templateFieldSchema.optional(),
      back_in_stock: templateFieldSchema.optional()
    })
    .optional()
});

function buildNotificationIntegrationStatus() {
  const resend = getResendEnv();
  const vapid = getWebPushVapidEnv();
  const sms = getAfricasTalkingSmsEnv();

  return {
    resendConfigured: Boolean(resend),
    orderNotifyEmail: resend?.toEmail ?? null,
    vapidConfigured: Boolean(vapid),
    vapidPublicKey: vapid?.publicKey ?? null,
    smsEnvEnabled: sms.enabledFlag,
    smsEnvConfigured: sms.configured,
    smsSandbox: sms.sandbox
  };
}

export async function GET() {
  try {
    await assertAdminRequest();
    const settings = await getStoreSettings();
    return NextResponse.json({
      settings,
      notifications: buildNotificationIntegrationStatus()
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to load store settings.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    await assertAdminRequest();
    const payload = updateSettingsSchema.parse(await request.json());
    const current = await getStoreSettings();

    const updates: StoreSettingsUpdate = {};
    if (payload.site_name !== undefined) updates.site_name = payload.site_name;
    if (payload.business_phone !== undefined) updates.business_phone = payload.business_phone;
    if (payload.business_email !== undefined) {
      updates.business_email = payload.business_email ? payload.business_email : null;
    }
    if (payload.business_address !== undefined) {
      updates.business_address = payload.business_address;
    }
    if (payload.kra_pin !== undefined) {
      updates.kra_pin = payload.kra_pin?.trim() || null;
    }
    if (payload.whatsapp_number !== undefined) {
      updates.whatsapp_number = payload.whatsapp_number.replace(/[^\d]/g, "");
    }
    if (payload.business_hours !== undefined) updates.business_hours = payload.business_hours;
    if (payload.same_day_cutoff !== undefined) {
      updates.same_day_cutoff = payload.same_day_cutoff;
    }
    if (payload.pending_auto_cancel_hours !== undefined) {
      updates.pending_auto_cancel_hours = payload.pending_auto_cancel_hours;
    }
    if (payload.low_stock_default !== undefined) {
      updates.low_stock_default = payload.low_stock_default;
    }
    if (payload.free_delivery_threshold !== undefined) {
      updates.free_delivery_threshold = payload.free_delivery_threshold;
    }
    if (payload.instagram_url !== undefined) updates.instagram_url = payload.instagram_url;
    if (payload.tiktok_url !== undefined) updates.tiktok_url = payload.tiktok_url;
    if (payload.is_store_open !== undefined) updates.is_store_open = payload.is_store_open;
    if (payload.holiday_banner_message !== undefined) {
      updates.holiday_banner_message = payload.holiday_banner_message;
    }
    if (payload.invoice_footer !== undefined) updates.invoice_footer = payload.invoice_footer;
    if (payload.payment_instructions !== undefined) {
      updates.payment_instructions = payload.payment_instructions;
    }
    if (payload.sms_notifications_enabled !== undefined) {
      updates.sms_notifications_enabled = payload.sms_notifications_enabled;
    }
    if (payload.message_templates !== undefined) {
      updates.message_templates = {
        ...DEFAULT_MESSAGE_TEMPLATES,
        ...current.message_templates,
        ...payload.message_templates
      };
    }

    const settings = await saveStoreSettings(updates);
    return NextResponse.json({
      settings,
      notifications: buildNotificationIntegrationStatus()
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid store settings payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to save store settings.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

