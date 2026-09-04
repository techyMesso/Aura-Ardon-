import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidOrderStatusTransition } from "@/lib/admin-orders";
import { assertAdminRequest } from "@/lib/auth";
import { getOrderWithItems } from "@/lib/data";
import type { Order } from "@/lib/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const orderUpdateSchema = z.object({
  status: z.enum([
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED"
  ])
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = await context.params;
    const result = await getOrderWithItems(id);

    if (!result) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to load order.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = await context.params;
    const payload = orderUpdateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();
    const { data: existingOrder, error: existingOrderError } = await supabase
      .from("orders")
      .select(
        "id, customer_name, customer_email, customer_phone, customer_location, notes, payment_method, payment_status, order_status, subtotal, shipping_fee, total, created_at"
      )
      .eq("id", id)
      .single();

    if (existingOrderError || !existingOrder) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (
      !isValidOrderStatusTransition(
        (existingOrder as Order).order_status,
        payload.status
      )
    ) {
      return NextResponse.json(
        { error: "Invalid status transition." },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ order_status: payload.status } as never)
      .eq("id", id)
      .select(
        "id, customer_name, customer_email, customer_phone, customer_location, notes, payment_method, payment_status, order_status, subtotal, shipping_fee, total, created_at"
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ order: data });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to update order.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
