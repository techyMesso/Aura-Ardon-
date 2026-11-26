import { NextResponse } from "next/server";
import { z } from "zod";

import { getStoreSettings, listDeliveryZones } from "@/lib/data";
import { formatDiscountValueLabel, normalizeDiscountCode } from "@/lib/discounts";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { DiscountCodeType } from "@/lib/types";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validateDiscountSchema = z.object({
  code: z.string().trim().min(1, "Enter a discount code.").max(40),
  items: z
    .array(
      z.object({
        productId: z.string().uuid("Invalid product ID."),
        variantId: z.string().uuid("Invalid variant ID.").nullable().optional(),
        quantity: z.number().int().positive("Invalid quantity.")
      })
    )
    .min(1, "Your bag is empty."),
  deliveryZoneId: z.string().uuid("Select a delivery zone."),
  phone: z.string().trim().max(30).optional().nullable()
});

interface EvaluateDiscountRpcRow {
  discount_code_id: string;
  normalized_code: string;
  discount_type: DiscountCodeType;
  discount_value: string | number;
  discount_amount: string | number;
  free_delivery_applied: boolean;
  delivery_fee: string | number;
  total: string | number;
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const limit = await checkRateLimit({
      key: `discount-validate:ip:${ip}`,
      limit: 25,
      windowMs: 10 * 60 * 1000
    });
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many promo code attempts. Please wait a few minutes." },
        { status: 429, headers: { "Retry-After": `${limit.retryAfterSeconds}` } }
      );
    }

    const payload = validateDiscountSchema.parse(await request.json());
    const cleanCode = normalizeDiscountCode(payload.code);

    let normalizedPhone: string | null = null;
    if (payload.phone && payload.phone.trim()) {
      try {
        normalizedPhone = normalizeKenyanPhoneNumber(payload.phone);
      } catch {
        normalizedPhone = null;
      }
    }

    const [storeSettings, deliveryZones] = await Promise.all([
      getStoreSettings(),
      listDeliveryZones()
    ]);

    const zone = deliveryZones.find(
      candidate => candidate.id === payload.deliveryZoneId && candidate.active
    );
    if (!zone) {
      return NextResponse.json(
        { error: "Selected delivery zone is not available." },
        { status: 400 }
      );
    }

    // Re-fetch authoritative product & variant prices from DB (never trust browser prices)
    const supabase = createAdminSupabaseClient();
    const productIds = Array.from(new Set(payload.items.map(item => item.productId)));
    const variantIds = Array.from(
      new Set(
        payload.items
          .map(item => item.variantId)
          .filter((value): value is string => Boolean(value))
      )
    );

    const [{ data: products, error: productsError }, variantsResp] = await Promise.all([
      supabase
        .from("products")
        .select("id, price, active, status")
        .in("id", productIds),
      variantIds.length > 0
        ? supabase
            .from("product_variants")
            .select("id, product_id, price_override, active")
            .in("id", variantIds)
        : Promise.resolve({ data: [] as unknown[], error: null })
    ]);

    if (productsError) {
      throw new Error(productsError.message);
    }
    if (variantsResp.error) {
      throw new Error(variantsResp.error.message);
    }

    const priceById = new Map<string, number>();
    for (const row of (products ?? []) as Array<{
      id: string;
      price: string | number;
      active: boolean;
      status?: string | null;
    }>) {
      if (row.active && (row.status === undefined || row.status === null || row.status === "active")) {
        priceById.set(row.id, Number(row.price));
      }
    }

    const variantById = new Map<
      string,
      { product_id: string; price_override: string | number | null; active: boolean }
    >();
    for (const row of (variantsResp.data ?? []) as Array<{
      id: string;
      product_id: string;
      price_override: string | number | null;
      active: boolean;
    }>) {
      variantById.set(row.id, row);
    }

    let subtotal = 0;
    for (const item of payload.items) {
      const basePrice = priceById.get(item.productId);
      if (basePrice === undefined) {
        return NextResponse.json(
          { error: "One or more items in your bag are no longer available." },
          { status: 400 }
        );
      }
      let unitPrice = basePrice;
      if (item.variantId) {
        const variant = variantById.get(item.variantId);
        if (!variant || !variant.active || variant.product_id !== item.productId) {
          return NextResponse.json(
            { error: "One or more selected options are no longer available." },
            { status: 400 }
          );
        }
        if (variant.price_override != null) {
          unitPrice = Number(variant.price_override);
        }
      }
      subtotal += unitPrice * item.quantity;
    }
    subtotal = Math.round(subtotal * 100) / 100;

    const { data, error } = (await supabase
      .rpc("evaluate_discount_code" as never, {
        p_code: cleanCode,
        p_subtotal: subtotal,
        p_zone_fee: zone.fee,
        p_free_delivery_threshold: storeSettings.free_delivery_threshold,
        p_customer_phone: normalizedPhone
      } as never)
      .single()) as {
      data: EvaluateDiscountRpcRow | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? `Discount code "${cleanCode}" is not valid.` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      code: data.normalized_code,
      type: data.discount_type,
      value: Number(data.discount_value),
      label: formatDiscountValueLabel(data.discount_type, data.discount_value),
      subtotal,
      discountAmount: Number(data.discount_amount),
      freeDeliveryApplied: Boolean(data.free_delivery_applied),
      deliveryFee: Number(data.delivery_fee),
      total: Number(data.total)
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid discount request."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to validate discount code.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

