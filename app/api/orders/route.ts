import { NextResponse } from "next/server";
import { z } from "zod";

import { revalidateProductCatalog } from "@/lib/cache";
import { getStoreSettings, listDeliveryZones } from "@/lib/data";
import { logger } from "@/lib/logger";
import { createOrderNumberToken } from "@/lib/order-status-token";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";
import { buildWhatsAppCheckoutUrl } from "@/lib/whatsapp-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDER_DB_TIMEOUT_MS = 6000;

const orderItemSchema = z.object({
  productId: z.string().uuid("Invalid product in bag."),
  quantity: z.number().int().positive("Quantity must be at least 1.")
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, "Your bag is empty."),
  fullName: z.string().trim().min(2, "Full name is required.").max(120),
  phone: z.string().trim().min(9, "Phone number is required.").max(30),
  deliveryZoneId: z.string().uuid("Please select a delivery zone."),
  buildingLandmark: z
    .string()
    .trim()
    .min(2, "Building, road, or landmark is required.")
    .max(240),
  townCounty: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(600).optional().nullable(),
  isGift: z.boolean().optional().default(false),
  giftNote: z.string().trim().max(300).optional().nullable(),
  hidePrices: z.boolean().optional().default(true),
  marketingOptIn: z.boolean().optional().default(false),
  discountCode: z.string().trim().max(40).optional().nullable(),
  // Hidden anti-bot honeypot — must remain empty
  website: z.string().optional().default("")
});

interface PlaceOrderRpcResult {
  order_id: string;
  order_number: string;
  subtotal: string | number;
  discount_code: string | null;
  discount_amount: string | number;
  delivery_zone_name: string;
  shipping_fee: string | number;
  total: string | number;
  status: string;
  replayed: boolean;
  item_summary: Array<{
    title: string;
    quantity: number;
    unit_price: string | number;
    line_total: string | number;
  }>;
}

function getOrderErrorStatus(message: string): number {
  if (message.includes("timed out")) return 504;
  if (message.startsWith("Store closed:")) return 503;
  if (message.includes("Please contact us on WhatsApp")) return 403;
  if (
    message.includes("Item just sold out") ||
    message.includes("Insufficient stock") ||
    message.includes("no longer available")
  ) {
    return 409;
  }
  if (
    message.includes("delivery zone") ||
    message.includes("Town or county") ||
    message.includes("Invalid quantity") ||
    message.includes("empty")
  ) {
    return 400;
  }
  return 500;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const ip = getClientIp(request.headers);
    const ipLimit = await checkRateLimit({
      key: `order:ip:${ip}`,
      limit: 5,
      windowMs: 10 * 60 * 1000
    });

    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many order attempts. Please wait a few minutes and try again." },
        {
          status: 429,
          headers: { "Retry-After": `${ipLimit.retryAfterSeconds}` }
        }
      );
    }

    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: "Missing Idempotency-Key header." },
        { status: 400 }
      );
    }

    const payload = createOrderSchema.parse(await request.json());

    // Silently block honeypot bot submissions
    if (payload.website && payload.website.trim().length > 0) {
      return NextResponse.json(
        { error: "Unable to process order." },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizeKenyanPhoneNumber(payload.phone);

    const phoneLimit = await checkRateLimit({
      key: `order:phone:${normalizedPhone}`,
      limit: 5,
      windowMs: 10 * 60 * 1000
    });

    if (!phoneLimit.ok) {
      return NextResponse.json(
        { error: "Too many order attempts for this phone number. Please wait a few minutes." },
        {
          status: 429,
          headers: { "Retry-After": `${phoneLimit.retryAfterSeconds}` }
        }
      );
    }

    const [storeSettings, deliveryZones] = await Promise.all([
      getStoreSettings(),
      listDeliveryZones()
    ]);

    if (!storeSettings.is_store_open) {
      return NextResponse.json(
        {
          error:
            storeSettings.holiday_banner_message.trim() ||
            "Our Nairobi studio is currently closed for orders. Please check back soon."
        },
        { status: 503 }
      );
    }

    const selectedZone = deliveryZones.find(
      zone => zone.id === payload.deliveryZoneId && zone.active
    );
    if (!selectedZone) {
      return NextResponse.json(
        { error: "Selected delivery zone is not available." },
        { status: 400 }
      );
    }

    if (selectedZone.is_outside_nairobi && !payload.townCounty?.trim()) {
      return NextResponse.json(
        { error: "Town or county is required for deliveries outside Nairobi." },
        { status: 400 }
      );
    }

    // Discount code server-side validation hook (expanded with discount_codes table in Phase 6)
    const requestedDiscountCode = payload.discountCode?.trim().toUpperCase() || null;
    if (requestedDiscountCode) {
      return NextResponse.json(
        { error: `Discount code "${requestedDiscountCode}" is not active or does not exist.` },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();

    const rpcCall = Promise.resolve(
      supabase
        .rpc("place_order" as never, {
          p_customer_name: payload.fullName,
          p_customer_phone: normalizedPhone,
          p_delivery_zone_id: selectedZone.id,
          p_delivery_address: payload.buildingLandmark,
          p_town_county: selectedZone.is_outside_nairobi
            ? payload.townCounty?.trim() || null
            : null,
          p_notes: payload.notes?.trim() || null,
          p_is_gift: payload.isGift,
          p_gift_note: payload.isGift ? payload.giftNote?.trim() || null : null,
          p_hide_prices: payload.isGift ? payload.hidePrices : false,
          p_marketing_opt_in: payload.marketingOptIn,
          p_discount_code: null,
          p_discount_amount: 0,
          p_idempotency_key: idempotencyKey,
          p_items: payload.items.map(item => ({
            product_id: item.productId,
            quantity: item.quantity
          }))
        } as never)
        .single()
    ) as Promise<{
      data: PlaceOrderRpcResult | null;
      error: { message: string } | null;
    }>;

    const { data, error } = await withTimeout(
      rpcCall,
      ORDER_DB_TIMEOUT_MS,
      "Order placement timed out while contacting the database."
    );

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to save your order.");
    }

    revalidateProductCatalog();

    const confirmationToken = createOrderNumberToken(data.order_number);
    const confirmationPath = `/order/${encodeURIComponent(data.order_number)}?t=${encodeURIComponent(confirmationToken)}`;
    const whatsappPhone =
      storeSettings.whatsapp_number ||
      process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
      "";

    const itemsSummary = (data.item_summary ?? []).map(item => ({
      title: item.title,
      quantity: item.quantity,
      lineTotal: Number(item.line_total ?? Number(item.unit_price) * item.quantity)
    }));

    const { url: whatsappUrl } = buildWhatsAppCheckoutUrl(whatsappPhone, {
      orderNumber: data.order_number,
      items: itemsSummary,
      subtotal: Number(data.subtotal),
      discountCode: data.discount_code,
      discountAmount: Number(data.discount_amount ?? 0),
      deliveryZoneName: data.delivery_zone_name || selectedZone.name,
      deliveryFee: Number(data.shipping_fee),
      total: Number(data.total),
      customerName: payload.fullName,
      customerPhone: normalizedPhone,
      deliveryAddress: payload.buildingLandmark,
      townCounty: selectedZone.is_outside_nairobi ? payload.townCounty : null,
      isGift: payload.isGift,
      giftNote: payload.isGift ? payload.giftNote : null,
      notes: payload.notes
    });

    return NextResponse.json(
      {
        ok: true,
        orderId: data.order_id,
        orderNumber: data.order_number,
        status: data.status,
        subtotal: Number(data.subtotal),
        discountCode: data.discount_code,
        discountAmount: Number(data.discount_amount ?? 0),
        deliveryZoneName: data.delivery_zone_name || selectedZone.name,
        deliveryFee: Number(data.shipping_fee),
        total: Number(data.total),
        items: itemsSummary,
        replayed: data.replayed,
        confirmationToken,
        confirmationPath,
        whatsappUrl
      },
      { status: data.replayed ? 200 : 201 }
    );
  } catch (caughtError) {
    const rawMessage =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Please check your checkout details."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to create your order.";
    const status =
      caughtError instanceof z.ZodError ? 400 : getOrderErrorStatus(rawMessage);
    const cleanMessage = rawMessage.replace(/^Store closed:\s*/i, "");

    logger.error("WhatsApp order creation failed", {
      durationMs: Date.now() - startedAt,
      status,
      error: cleanMessage
    });

    return NextResponse.json({ error: cleanMessage }, { status });
  }
}

