import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { normalizeKenyanPhoneNumber, toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.string()
});

const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema),
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional().nullable(),
  customerPhone: z.string().min(9),
  customerLocation: z.string().min(1),
  notes: z.string().optional().nullable(),
  paymentMethod: z.enum(["mpesa", "cash_on_delivery"]),
  subtotal: z.string(),
  shippingFee: z.string(),
  totalAmount: z.string()
});

export async function POST(request: Request) {
  try {
    const payload = checkoutSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    // Validate stock for each item
    for (const item of payload.items) {
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", item.productId)
        .single();

      if (productError || !product) {
        throw new Error(`Product not found`);
      }

      const productData = product as { stock_quantity: number };
      if (productData.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for one or more items`);
      }
    }

    // Calculate totals
    const subtotal = Number(payload.subtotal) || 0;
    const shippingFee = Number(payload.shippingFee) || 0;
    const total = Number(payload.totalAmount) || subtotal + shippingFee;

    // Create the order with new field names
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_name: payload.customerName,
        customer_email: payload.customerEmail || null,
        customer_phone: normalizeKenyanPhoneNumber(payload.customerPhone),
        customer_location: payload.customerLocation,
        notes: payload.notes || null,
        payment_method: payload.paymentMethod,
        payment_status: "pending",
        order_status: "new",
        subtotal: toMoneyString(subtotal),
        shipping_fee: toMoneyString(shippingFee),
        total: toMoneyString(total),
        checkout_request_id: payload.paymentMethod === "mpesa" 
          ? `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`
          : null
      } as never)
      .select()
      .single();

    if (orderError) {
      throw new Error(orderError.message);
    }

    // Create order items
    const orderData = order as { id: string };
    const orderItems = payload.items.map(item => ({
      order_id: orderData.id,
      product_id: item.productId,
      product_title: "", // Will fill below
      quantity: item.quantity,
      unit_price: item.unitPrice
    }));

    // Fetch product names
    for (let i = 0; i < payload.items.length; i++) {
      const item = payload.items[i];
      const { data: product } = await supabase
        .from("products")
        .select("title")
        .eq("id", item.productId)
        .single();

      if (product) {
        const productData = product as { title: string };
        orderItems[i].product_title = productData.title;
      }
    }

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems as never);

    if (itemsError) {
      throw new Error(itemsError.message);
    }

    // For M-Pesa, initiate STK push (simplified - would integrate with M-Pesa API in production)
    if (payload.paymentMethod === "mpesa") {
      // In production, you would call the M-Pesa API here
      // For now, we'll just create the order with pending status
    }

    // Update stock quantities
    for (const item of payload.items) {
      const { data: product } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", item.productId)
        .single();

      if (product) {
        const productData = product as { stock_quantity: number };
        await supabase
          .from("products")
          .update({ stock_quantity: productData.stock_quantity - item.quantity } as never)
          .eq("id", item.productId);
      }
    }

    return NextResponse.json({ 
      success: true, 
      orderId: orderData.id,
      message: payload.paymentMethod === "cash_on_delivery" 
        ? "Order placed successfully. We'll contact you for delivery."
        : "Order placed. Please complete M-Pesa payment."
    }, { status: 201 });

  } catch (caughtError) {
    const message = caughtError instanceof Error 
      ? caughtError.message 
      : "Failed to process order";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}