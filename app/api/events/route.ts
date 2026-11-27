import { NextResponse } from "next/server";
import { z } from "zod";

import { isBotUserAgent } from "@/lib/analytics";
import { resolveUserAdminRole } from "@/lib/auth";
import {
  hasInternalCookieInHeader,
  isAdminPath
} from "@/lib/internal-traffic";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BEGIN_CHECKOUT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

const eventPayloadSchema = z.object({
  name: z.enum([
    "product_view",
    "add_to_bag",
    "begin_checkout",
    "whatsapp_order_sent",
    "whatsapp_product_question"
  ]),
  productId: z.string().uuid().nullable().optional(),
  orderNumber: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "Invalid order number.")
    .nullable()
    .optional(),
  sessionId: z
    .string()
    .trim()
    .min(8, "Invalid session ID.")
    .max(80, "Invalid session ID.")
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid session ID."),
  path: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine(val => val.startsWith("/"), "Path must start with /")
});

async function detectInternalTraffic(request: Request): Promise<boolean> {
  const cookieHeader = request.headers.get("cookie");
  if (hasInternalCookieInHeader(cookieHeader)) {
    return true;
  }

  // Only incur Supabase auth lookup when a Supabase session cookie is present
  if (!cookieHeader || !cookieHeader.includes("sb-")) {
    return false;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return false;
    const role = await resolveUserAdminRole(user);
    return role === "owner" || role === "staff";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // Ignore crawlers, bots, and headless scrapers without touching the DB
    const userAgent = request.headers.get("user-agent");
    if (isBotUserAgent(userAgent)) {
      return NextResponse.json({ ok: true, ignored: "bot" }, { status: 202 });
    }

    const payload = eventPayloadSchema.parse(await request.json());
    const cleanPath = payload.path.split("?")[0].slice(0, 300);

    // Never track storefront events on /admin routes
    const referer = request.headers.get("referer");
    if (isAdminPath(cleanPath) || (referer && isAdminPath(referer))) {
      return NextResponse.json({ ok: true, ignored: "admin_route" }, { status: 202 });
    }

    // whatsapp_order_sent MUST include a saved order number
    const normalizedOrderNumber = payload.orderNumber?.trim().toUpperCase() || null;
    if (payload.name === "whatsapp_order_sent" && !normalizedOrderNumber) {
      return NextResponse.json(
        { error: "orderNumber is required for whatsapp_order_sent events." },
        { status: 400 }
      );
    }

    // Rate-limit strictly by anonymous random sessionId — never store IP addresses
    const limit = await checkRateLimit({
      key: `events:session:${payload.sessionId}`,
      limit: 60,
      windowMs: 60_000
    });

    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many events." },
        {
          status: 429,
          headers: { "Retry-After": `${limit.retryAfterSeconds}` }
        }
      );
    }

    const isInternal = await detectInternalTraffic(request);
    const supabase = createAdminSupabaseClient();

    // Server-side dedupe: begin_checkout at most once per session per 30 minutes
    if (payload.name === "begin_checkout") {
      const cutoffIso = new Date(
        Date.now() - BEGIN_CHECKOUT_DEDUPE_WINDOW_MS
      ).toISOString();
      const { data: recentCheckout } = await supabase
        .from("events")
        .select("id")
        .eq("name", "begin_checkout")
        .eq("session_id", payload.sessionId)
        .gte("created_at", cutoffIso)
        .limit(1);

      if (Array.isArray(recentCheckout) && recentCheckout.length > 0) {
        return NextResponse.json(
          { ok: true, deduped: true, isInternal },
          { status: 200 }
        );
      }
    }

    // Server-side dedupe: whatsapp_order_sent at most once per order_number
    if (payload.name === "whatsapp_order_sent" && normalizedOrderNumber) {
      const { data: existingOrderEvent } = await supabase
        .from("events")
        .select("id")
        .eq("name", "whatsapp_order_sent")
        .eq("order_number", normalizedOrderNumber)
        .limit(1);

      if (Array.isArray(existingOrderEvent) && existingOrderEvent.length > 0) {
        return NextResponse.json(
          { ok: true, deduped: true, isInternal },
          { status: 200 }
        );
      }
    }

    const row: Record<string, unknown> = {
      name: payload.name,
      product_id: payload.productId ?? null,
      session_id: payload.sessionId,
      path: cleanPath
    };
    if (isInternal) {
      row.is_internal = true;
    }
    if (normalizedOrderNumber) {
      row.order_number = normalizedOrderNumber;
    }

    const { error } = await supabase.from("events").insert(row as never);

    if (error) {
      // Unique index guard for concurrent duplicate whatsapp_order_sent
      if (error.code === "23505" && payload.name === "whatsapp_order_sent") {
        return NextResponse.json(
          { ok: true, deduped: true, isInternal },
          { status: 200 }
        );
      }
      return NextResponse.json({ error: "Unable to record event." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, isInternal }, { status: 201 });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid event payload."
        : "Unable to record event.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
