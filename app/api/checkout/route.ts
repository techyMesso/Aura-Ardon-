import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { createOrderStatusToken } from "@/lib/order-status-token";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createWhatsAppOrderUrl, normalizeKenyanPhoneNumber } from "@/lib/utils";

export const runtime = "nodejs";

const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive()
});

const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1, "Your cart is empty."),
  customerName: z.string().trim().min(1, "Customer name is required."),
  customerEmail: z.string().email().optional().nullable(),
  customerPhone: z.string().trim().min(9, "Phone number is required."),
  customerLocation: z.string().trim().min(1, "Delivery location is required."),
  notes: z.string().trim().max(1000).optional().nullable(),
  paymentMethod: z.enum(["CASH_ON_DELIVERY", "WHATSAPP"])
});

interface CheckoutOrderResult {
  order_id: string;
  subtotal: string | number;
  shipping_fee: string | number;
  total: string | number;
  payment_method: "CASH_ON_DELIVERY" | "WHATSAPP";
  payment_status: "PENDING" | "PAID";
  order_status:
    | "PENDING_CONFIRMATION"
    | "CONFIRMED"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "CANCELLED";
  replayed: boolean;
  item_summary: Array<{
    title: string;
    quantity: number;
  }>;
}

function getCheckoutErrorStatus(message: string) {
  if (message.includes("timed out")) {
    return 504;
  }

  if (
    message.includes("Insufficient stock") ||
    message.includes("is out of stock")
  ) {
    return 409;
  }

  if (
    message.includes("not available") ||
    message.includes("Invalid quantity") ||
    message.includes("empty")
  ) {
    return 400;
  }

  return 500;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

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

const CHECKOUT_DB_TIMEOUT_MS = 5000;

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const ip = getClientIp(request.headers);
    const rateLimit = checkRateLimit({
      key: `checkout:${ip}`,
      limit: 10,
      windowMs: 5 * 60 * 1000
    });

    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": `${rateLimit.retryAfterSeconds}`
          }
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

    const payload = checkoutSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    // The database function performs the entire checkout inside one transaction:
    // 1. Fetch all requested products in one query and lock them for update
    // 2. Process availability and pricing from the locked in-memory snapshot
    // 3. Reuse an existing order when the same Idempotency-Key is retried
    // 4. Otherwise perform one transactional write path and return the saved item summary
    const checkoutOperation = Promise.resolve(
      supabase
        .rpc("create_checkout_order" as never, {
          checkout_customer_name: payload.customerName,
          checkout_customer_email: payload.customerEmail ?? null,
          checkout_customer_phone: normalizeKenyanPhoneNumber(payload.customerPhone),
          checkout_customer_location: payload.customerLocation,
          checkout_notes: payload.notes ?? null,
          checkout_payment_method: payload.paymentMethod,
          checkout_idempotency_key: idempotencyKey,
          checkout_items: payload.items.map(item => ({
            product_id: item.productId,
            quantity: item.quantity
          }))
        } as never)
        .single()
    ) as Promise<{
      data: CheckoutOrderResult | null;
      error: { message: string } | null;
    }>;

    const { data, error } = await withTimeout(
      checkoutOperation,
      CHECKOUT_DB_TIMEOUT_MS,
      "Checkout timed out while waiting for the database."
    );

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to create order.");
    }

    const order = data as CheckoutOrderResult;

    const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

    if (!whatsappNumber) {
      throw new Error("Missing required environment variable: NEXT_PUBLIC_WHATSAPP_NUMBER");
    }

    const whatsappUrl = createWhatsAppOrderUrl({
      phoneNumber: whatsappNumber,
      orderId: order.order_id,
      customerName: payload.customerName,
      deliveryLocation: payload.customerLocation,
      total: order.total,
      items: order.item_summary
    });
    const orderStatusToken = createOrderStatusToken(order.order_id);

    const successMessage =
      payload.paymentMethod === "CASH_ON_DELIVERY"
        ? "Order placed. We'll contact you for delivery. Payment will be collected on delivery."
        : "Order placed. We'll confirm the details with you on WhatsApp before payment.";

    return NextResponse.json({
      success: true,
      orderId: order.order_id,
      subtotal: order.subtotal,
      shippingFee: order.shipping_fee,
      total: order.total,
      whatsappUrl,
      orderStatusToken,
      replayed: order.replayed,
      message: successMessage
    }, { status: order.replayed ? 200 : 201 });

  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid checkout payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Failed to process order";
    const status =
      caughtError instanceof z.ZodError ? 400 : getCheckoutErrorStatus(message);

    logger.error("Checkout request failed", {
      durationMs: Date.now() - startedAt,
      error: message,
      status
    });

    return NextResponse.json({ error: message }, { status });
  }
}
