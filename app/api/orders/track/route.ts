import { NextResponse } from "next/server";
import { z } from "zod";

import { getOrderByNumber, getStoreSettings } from "@/lib/data";
import { createOrderNumberToken } from "@/lib/order-status-token";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { CanonicalOrderStatus, Order } from "@/lib/types";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";
import { buildWhatsAppCheckoutUrl } from "@/lib/whatsapp-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const trackSchema = z.object({
  orderNumber: z.string().trim().min(3, "Enter your order number (e.g. AA-7F3K2).").max(32),
  phone: z.string().trim().min(9, "Enter the phone number used on your order.").max(30)
});

function resolveCanonicalStatus(order: Order): CanonicalOrderStatus {
  if (order.status) return order.status;
  switch (order.order_status) {
    case "CONFIRMED":
      return "confirmed";
    case "OUT_FOR_DELIVERY":
      return "dispatched";
    case "DELIVERED":
      return "delivered";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const limit = await checkRateLimit({
    key: `order-track:${ip}`,
    limit: 20,
    windowMs: 10 * 60 * 1000
  });

  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many tracking requests. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": `${limit.retryAfterSeconds}` } }
    );
  }

  try {
    const payload = trackSchema.parse(await request.json());
    const normalizedOrderNumber = payload.orderNumber.trim().toUpperCase();
    const normalizedPhone = normalizeKenyanPhoneNumber(payload.phone);

    const record = await getOrderByNumber(normalizedOrderNumber);
    if (!record) {
      return NextResponse.json(
        { error: "No order found matching that order number and phone number." },
        { status: 404 }
      );
    }

    let storedPhone = record.order.customer_phone;
    try {
      storedPhone = normalizeKenyanPhoneNumber(record.order.customer_phone);
    } catch {
      // Keep stored digits if non-standard legacy format
    }

    if (storedPhone !== normalizedPhone) {
      return NextResponse.json(
        { error: "No order found matching that order number and phone number." },
        { status: 404 }
      );
    }

    const { order, items } = record;
    const orderNumber = order.order_number || normalizedOrderNumber;
    const settings = await getStoreSettings();
    const confirmationToken = createOrderNumberToken(orderNumber);

    const { url: whatsappUrl } = buildWhatsAppCheckoutUrl(
      settings.whatsapp_number,
      {
        orderNumber,
        items: items.map(item => ({
          title: item.product_title,
          quantity: item.quantity,
          lineTotal: Number(item.unit_price) * item.quantity
        })),
        subtotal: Number(order.subtotal),
        discountCode: order.discount_code ?? null,
        discountAmount: Number(order.discount_amount ?? 0),
        deliveryZoneName: order.delivery_zone_name || order.customer_location,
        deliveryFee: Number(order.shipping_fee),
        total: Number(order.total),
        customerName: order.customer_name,
        customerPhone: storedPhone,
        deliveryAddress: order.delivery_address || order.customer_location,
        townCounty: order.town_county ?? null,
        isGift: Boolean(order.is_gift),
        giftNote: order.gift_note ?? null,
        notes: order.notes ?? null
      }
    );

    return NextResponse.json({
      orderNumber,
      status: resolveCanonicalStatus(order),
      paymentStatus: order.payment_status,
      createdAt: order.created_at,
      customerName: order.customer_name,
      deliveryZoneName: order.delivery_zone_name || null,
      deliveryAddress: order.delivery_address || order.customer_location,
      townCounty: order.town_county ?? null,
      subtotal: Number(order.subtotal),
      discountCode: order.discount_code ?? null,
      discountAmount: Number(order.discount_amount ?? 0),
      deliveryFee: Number(order.shipping_fee),
      total: Number(order.total),
      isGift: Boolean(order.is_gift),
      giftNote: order.gift_note ?? null,
      items: items.map(item => ({
        id: item.id,
        productId: item.product_id,
        title: item.product_title,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        lineTotal: Number(item.unit_price) * item.quantity
      })),
      confirmationToken,
      whatsappUrl
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Please check your order number and phone."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to look up order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

