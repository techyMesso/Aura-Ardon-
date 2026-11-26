import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { listAdminPushSubscriptions } from "@/lib/data";
import { getWebPushVapidEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.string().trim().url("Invalid push subscription endpoint.").max(2048),
  keys: z.object({
    p256dh: z.string().trim().min(10, "Missing p256dh push key.").max(512),
    auth: z.string().trim().min(6, "Missing auth push key.").max(256)
  }),
  userAgent: z.string().trim().max(400).optional().nullable()
});

const unsubscribeSchema = z.object({
  endpoint: z.string().trim().url("Invalid push subscription endpoint.").max(2048)
});

export async function GET() {
  try {
    const adminUser = await assertAdminRequest();
    const vapid = getWebPushVapidEnv();
    const subscriptions = adminUser?.id
      ? await listAdminPushSubscriptions(adminUser.id)
      : [];

    return NextResponse.json({
      configured: Boolean(vapid),
      vapidPublicKey: vapid?.publicKey ?? null,
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        endpoint: sub.endpoint,
        user_agent: sub.user_agent,
        last_used_at: sub.last_used_at,
        created_at: sub.created_at
      }))
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to load push subscriptions.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const adminUser = await assertAdminRequest();
    if (!adminUser?.id || !adminUser.email) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const payload = subscribeSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const { data, error } = await supabase
      .from("admin_push_subscriptions")
      .upsert(
        {
          user_id: adminUser.id,
          user_email: adminUser.email.toLowerCase(),
          endpoint: payload.endpoint,
          p256dh: payload.keys.p256dh,
          auth: payload.keys.auth,
          user_agent: payload.userAgent?.trim() || null,
          active: true
        } as never,
        { onConflict: "endpoint" }
      )
      .select("id, endpoint, user_agent, last_used_at, created_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to save push subscription.");
    }

    return NextResponse.json({ ok: true, subscription: data }, { status: 201 });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid push subscription payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to save push subscription.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const adminUser = await assertAdminRequest();
    if (!adminUser?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const payload = unsubscribeSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const { error } = await supabase
      .from("admin_push_subscriptions")
      .update({ active: false } as never)
      .eq("user_id", adminUser.id)
      .eq("endpoint", payload.endpoint);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid unsubscribe payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to remove push subscription.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

