import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidOrderStatusTransition } from "@/lib/admin-orders";
import { assertAdminRequest } from "@/lib/auth";
import { revalidateProductCatalog } from "@/lib/cache";
import { getOrderDetailBundle } from "@/lib/data";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Order, OrderStatus, PaymentStatus } from "@/lib/types";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid order ID.")
});

const orderUpdateSchema = z
  .object({
    status: z
      .enum([
        "PENDING_CONFIRMATION",
        "CONFIRMED",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED"
      ])
      .optional(),
    paymentStatus: z.enum(["PENDING", "PAID"]).optional()
  })
  .refine(
    payload => payload.status !== undefined || payload.paymentStatus !== undefined,
    { message: "Provide an order status or payment status to update." }
  );

const ORDER_SELECT =
  "id, customer_name, customer_email, customer_phone, customer_location, notes, payment_method, payment_status, order_status, subtotal, shipping_fee, total, created_at";

async function restoreOrderStockFallback(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  orderId: string
) {
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", orderId);

  if (itemsError || !items?.length) {
    return;
  }

  const quantitiesByProduct = new Map<string, number>();
  for (const item of items as Array<{ product_id: string | null; quantity: number }>) {
    if (!item.product_id || item.quantity <= 0) continue;
    quantitiesByProduct.set(
      item.product_id,
      (quantitiesByProduct.get(item.product_id) ?? 0) + item.quantity
    );
  }

  for (const [productId, quantity] of quantitiesByProduct) {
    const { data: product } = await supabase
      .from("products")
      .select("stock_quantity")
      .eq("id", productId)
      .maybeSingle();

    if (!product || typeof (product as { stock_quantity?: number }).stock_quantity !== "number") {
      continue;
    }

    const currentStock = (product as { stock_quantity: number }).stock_quantity;
    await supabase
      .from("products")
      .update({ stock_quantity: currentStock + quantity } as never)
      .eq("id", productId);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const result = await getOrderDetailBundle(id);

    if (!result) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid order ID."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load order.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Orders cannot be deleted. Cancel the order instead." },
    { status: 405 }
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = orderUpdateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    // Prefer the atomic database RPC (validates transitions + restores stock on CANCELLED in one transaction).
    if (typeof supabase.rpc === "function") {
      const rpcResult = (await supabase
        .rpc("update_admin_order" as never, {
          target_order_id: id,
          next_order_status: payload.status ?? null,
          next_payment_status: payload.paymentStatus ?? null
        } as never)
        .single()) as {
        data: Order | null;
        error: { code?: string; message: string } | null;
      };

      if (!rpcResult.error && rpcResult.data) {
        if (payload.status === "CANCELLED") {
          revalidateProductCatalog();
        }
        return NextResponse.json({ order: rpcResult.data });
      }

      const rpcMessage = rpcResult.error?.message ?? "";
      const rpcMissing =
        rpcResult.error?.code === "PGRST202" ||
        rpcMessage.includes("Could not find the function") ||
        rpcMessage.includes("does not exist");

      if (!rpcMissing) {
        if (rpcMessage.includes("Order not found")) {
          return NextResponse.json({ error: "Order not found." }, { status: 404 });
        }
        if (rpcMessage.includes("Invalid status transition")) {
          return NextResponse.json({ error: "Invalid status transition." }, { status: 409 });
        }
        throw new Error(rpcMessage || "Unable to update order.");
      }

      logger.warn("update_admin_order RPC unavailable; falling back to guarded application update", {
        orderId: id
      });
    }

    // Fallback path when harden-rls-and-order-ops.sql has not yet been applied.
    const { data: existingOrder, error: existingOrderError } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("id", id)
      .single();

    if (existingOrderError || !existingOrder) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const currentOrder = existingOrder as Order;
    const nextOrderStatus: OrderStatus = payload.status ?? currentOrder.order_status;
    const nextPaymentStatus: PaymentStatus =
      payload.paymentStatus ?? currentOrder.payment_status;

    if (
      payload.status !== undefined &&
      !isValidOrderStatusTransition(currentOrder.order_status, nextOrderStatus)
    ) {
      return NextResponse.json(
        { error: "Invalid status transition." },
        { status: 409 }
      );
    }

    const updates: Partial<Pick<Order, "order_status" | "payment_status">> = {};
    if (payload.status !== undefined) updates.order_status = nextOrderStatus;
    if (payload.paymentStatus !== undefined) updates.payment_status = nextPaymentStatus;

    // Optimistically guard on current order_status to prevent concurrent double-cancel restores.
    const { data, error } = await supabase
      .from("orders")
      .update(updates as never)
      .eq("id", id)
      .eq("order_status", currentOrder.order_status)
      .select(ORDER_SELECT)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        { error: "Order status changed concurrently. Refresh and try again." },
        { status: 409 }
      );
    }

    if (currentOrder.order_status !== "CANCELLED" && nextOrderStatus === "CANCELLED") {
      await restoreOrderStockFallback(supabase, id);
      revalidateProductCatalog();
    }

    return NextResponse.json({ order: data });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid order update."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update order.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
