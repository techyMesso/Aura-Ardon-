import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backInStockSchema = z.object({
  productId: z.string().uuid("Invalid product."),
  variantId: z.string().uuid("Invalid option.").nullable().optional(),
  phone: z.string().trim().min(9, "Enter a valid Kenyan phone number.").max(30),
  customerName: z.string().trim().max(120).optional().nullable(),
  website: z.string().optional().default("")
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const ipLimit = await checkRateLimit({
      key: `bis:ip:${ip}`,
      limit: 10,
      windowMs: 10 * 60 * 1000
    });
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many alert requests. Please wait a few minutes." },
        { status: 429, headers: { "Retry-After": `${ipLimit.retryAfterSeconds}` } }
      );
    }

    const payload = backInStockSchema.parse(await request.json());

    if (payload.website && payload.website.trim().length > 0) {
      return NextResponse.json({ error: "Unable to save alert." }, { status: 400 });
    }

    const normalizedPhone = normalizeKenyanPhoneNumber(payload.phone);

    const phoneLimit = await checkRateLimit({
      key: `bis:phone:${normalizedPhone}`,
      limit: 10,
      windowMs: 10 * 60 * 1000
    });
    if (!phoneLimit.ok) {
      return NextResponse.json(
        { error: "Too many alert requests for this phone number. Please wait a few minutes." },
        { status: 429, headers: { "Retry-After": `${phoneLimit.retryAfterSeconds}` } }
      );
    }

    const supabase = createAdminSupabaseClient();

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, title, stock_quantity, active, status")
      .eq("id", payload.productId)
      .maybeSingle();

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const typedProduct = product as {
      id: string;
      title: string;
      stock_quantity: number;
      active: boolean;
      status?: string | null;
    };

    if (!typedProduct.active || (typedProduct.status && typedProduct.status !== "active")) {
      return NextResponse.json(
        { error: "This product is currently unavailable." },
        { status: 404 }
      );
    }

    if (payload.variantId) {
      const { data: variant } = await supabase
        .from("product_variants")
        .select("id, product_id, stock_quantity, active")
        .eq("id", payload.variantId)
        .eq("product_id", payload.productId)
        .maybeSingle();

      const typedVariant = variant as {
        id: string;
        stock_quantity: number;
        active: boolean;
      } | null;

      if (!typedVariant || !typedVariant.active) {
        return NextResponse.json({ error: "Selected option not found." }, { status: 404 });
      }
      if (typedVariant.stock_quantity > 0) {
        return NextResponse.json(
          { error: "Good news — this option is currently in stock!" },
          { status: 409 }
        );
      }
    } else if (typedProduct.stock_quantity > 0) {
      return NextResponse.json(
        { error: "Good news — this piece is currently in stock!" },
        { status: 409 }
      );
    }

    const { error: insertError } = await supabase
      .from("back_in_stock_alerts")
      .insert({
        product_id: payload.productId,
        variant_id: payload.variantId ?? null,
        phone: normalizedPhone,
        customer_name: payload.customerName?.trim() || null,
        status: "waiting"
      } as never);

    if (insertError) {
      if (
        insertError.code === "23505" ||
        insertError.message.toLowerCase().includes("duplicate")
      ) {
        return NextResponse.json({
          ok: true,
          alreadyWaiting: true,
          message:
            "You're already on the WhatsApp waitlist — we'll message you as soon as it's back in stock."
        });
      }
      throw new Error(insertError.message);
    }

    return NextResponse.json(
      {
        ok: true,
        alreadyWaiting: false,
        message:
          "You're on the list! We'll message you on WhatsApp as soon as this piece is restocked."
      },
      { status: 201 }
    );
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Please enter a valid Kenyan phone number."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to register back-in-stock alert.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

