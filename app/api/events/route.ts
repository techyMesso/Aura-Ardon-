import { NextResponse } from "next/server";
import { z } from "zod";

import { isBotUserAgent } from "@/lib/analytics";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventPayloadSchema = z.object({
  name: z.enum([
    "product_view",
    "add_to_bag",
    "begin_checkout",
    "whatsapp_order_sent",
    "whatsapp_product_question"
  ]),
  productId: z.string().uuid().nullable().optional(),
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

export async function POST(request: Request) {
  try {
    // Ignore crawlers, bots, and headless scrapers without touching the DB
    const userAgent = request.headers.get("user-agent");
    if (isBotUserAgent(userAgent)) {
      return NextResponse.json({ ok: true, ignored: "bot" }, { status: 202 });
    }

    const payload = eventPayloadSchema.parse(await request.json());

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

    const supabase = createAdminSupabaseClient();
    const { error } = await supabase.from("events").insert({
      name: payload.name,
      product_id: payload.productId ?? null,
      session_id: payload.sessionId,
      path: payload.path.split("?")[0].slice(0, 300) // strip query strings so tokens/params are never stored
    } as never);

    if (error) {
      return NextResponse.json({ error: "Unable to record event." }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid event payload."
        : "Unable to record event.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

