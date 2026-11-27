import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { revalidateProductCatalog } from "@/lib/cache";
import { getOrderDetailBundle } from "@/lib/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid order ID.")
});

const cancelOrderSchema = z.object({
  reason: z.enum([
    "customer_no_response",
    "customer_cancelled",
    "out_of_stock",
    "fake_order",
    "delivery_failed",
    "other"
  ]),
  note: z.string().trim().max(400).optional().nullable()
});

interface CancelOrderRpcResult {
  order_id: string;
  order_number: string;
  status: string;
  restocked_items_count: number;
  already_restocked: boolean;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = cancelOrderSchema.parse(await request.json());

    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const supabase = createAdminSupabaseClient();

    const { data, error } = (await supabase
      .rpc("cancel_order" as never, {
        p_order_id: id,
        p_reason: payload.reason,
        p_note: payload.note ?? null,
        p_changed_by: actor
      } as never)
      .single()) as {
      data: CancelOrderRpcResult | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      const msg = error?.message ?? "Unable to cancel order.";
      if (msg.includes("Order not found")) {
        return NextResponse.json({ error: "Order not found." }, { status: 404 });
      }
      if (msg.includes("Invalid status transition")) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      throw new Error(msg);
    }

    if (!data.already_restocked) {
      revalidateProductCatalog();
    }

    const detail = await getOrderDetailBundle(id);

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: actor,
        role: adminUser?.adminRole ?? "owner"
      },
      action: "order.cancelled",
      entity: "order",
      entityId: id,
      after: {
        orderNumber: data.order_number,
        reason: payload.reason,
        note: payload.note ?? null,
        restockedItemsCount: Number(data.restocked_items_count ?? 0)
      }
    });

    return NextResponse.json({
      ok: true,
      restockedItemsCount: Number(data.restocked_items_count ?? 0),
      alreadyRestocked: Boolean(data.already_restocked),
      orderNumber: data.order_number,
      ...(detail ?? {})
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Please select a cancellation reason."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to cancel order.";
    const status =
      message === "UNAUTHORIZED" || message === "SESSION_EXPIRED"
        ? 401
        : message === "FORBIDDEN" || message === "MFA_REQUIRED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
