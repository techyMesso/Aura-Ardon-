import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getOrderDetailBundle } from "@/lib/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid order ID.")
});

const statusChangeSchema = z.object({
  status: z.enum(["confirmed", "dispatched", "delivered"]),
  reason: z.string().trim().max(300).optional().nullable()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = statusChangeSchema.parse(await request.json());

    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const supabase = createAdminSupabaseClient();

    const { error } = await supabase
      .rpc("set_order_status" as never, {
        p_order_id: id,
        p_to_status: payload.status,
        p_changed_by: actor,
        p_reason: payload.reason ?? null
      } as never)
      .single();

    if (error) {
      if (error.message.includes("Order not found")) {
        return NextResponse.json({ error: "Order not found." }, { status: 404 });
      }
      if (
        error.message.includes("Invalid status transition") ||
        error.message.includes("Use cancel_order") ||
        error.message.includes("Use return_order")
      ) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw new Error(error.message);
    }

    const detail = await getOrderDetailBundle(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...detail });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid status payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update order status.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

