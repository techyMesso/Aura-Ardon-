import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { revalidateProductCatalog } from "@/lib/cache";
import { getOrderDetailBundle } from "@/lib/data";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid order ID.")
});

const returnOrderSchema = z.object({
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid("Invalid order item."),
        quantity: z.number().int().positive("Return quantity must be at least 1.")
      })
    )
    .min(1, "Select at least one item to return."),
  condition: z.enum(["resellable", "damaged"]),
  note: z.string().trim().max(400).optional().nullable()
});

interface ReturnOrderRpcResult {
  order_id: string;
  order_number: string;
  status: string;
  returned_units: number;
  restocked_units: number;
  returned_amount: string | number;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = returnOrderSchema.parse(await request.json());

    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const supabase = createAdminSupabaseClient();

    const { data, error } = (await supabase
      .rpc("return_order" as never, {
        p_order_id: id,
        p_items: payload.items.map(item => ({
          order_item_id: item.orderItemId,
          quantity: item.quantity
        })),
        p_condition: payload.condition,
        p_note: payload.note ?? null,
        p_changed_by: actor
      } as never)
      .single()) as {
      data: ReturnOrderRpcResult | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      const msg = error?.message ?? "Unable to record order return.";
      if (msg.includes("Order not found")) {
        return NextResponse.json({ error: "Order not found." }, { status: 404 });
      }
      if (
        msg.includes("Only delivered orders") ||
        msg.includes("Cannot return")
      ) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      throw new Error(msg);
    }

    if (Number(data.restocked_units ?? 0) > 0) {
      revalidateProductCatalog();
    }

    const detail = await getOrderDetailBundle(id);

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: actor,
        role: adminUser?.adminRole ?? "owner"
      },
      action: "order.returned",
      entity: "order",
      entityId: id,
      after: {
        orderNumber: data.order_number,
        condition: payload.condition,
        returnedUnits: Number(data.returned_units ?? 0),
        restockedUnits: Number(data.restocked_units ?? 0),
        returnedAmount: Number(data.returned_amount ?? 0),
        note: payload.note ?? null
      }
    });

    logger.info("order.returned", {
      orderId: id,
      orderNumber: data.order_number,
      condition: payload.condition,
      returnedUnits: Number(data.returned_units ?? 0),
      restockedUnits: Number(data.restocked_units ?? 0),
      returnedAmountKes: Number(data.returned_amount ?? 0)
    });

    return NextResponse.json({
      ok: true,
      returnedUnits: Number(data.returned_units ?? 0),
      restockedUnits: Number(data.restocked_units ?? 0),
      returnedAmount: Number(data.returned_amount ?? 0),
      orderNumber: data.order_number,
      ...(detail ?? {})
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid return details."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to record return.";
    const status =
      message === "UNAUTHORIZED" || message === "SESSION_EXPIRED"
        ? 401
        : message === "FORBIDDEN" || message === "MFA_REQUIRED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
