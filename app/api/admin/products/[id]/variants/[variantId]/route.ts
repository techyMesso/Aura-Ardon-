import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertAdminRequest,
  isOwnerUser,
  stripVariantCostPrice
} from "@/lib/auth";
import { variantUpdateSchema } from "@/lib/admin-product-input";
import { revalidateProductCatalog } from "@/lib/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ProductVariant } from "@/lib/types";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid product ID."),
  variantId: z.string().uuid("Invalid variant ID.")
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const canManageCost = isOwnerUser(adminUser);
    const { id, variantId } = paramsSchema.parse(await context.params);
    const payload = variantUpdateSchema.parse(await request.json());

    const supabase = createAdminSupabaseClient();
    const { data: existing } = await supabase
      .from("product_variants")
      .select("id, product_id, stock_quantity, image_url, image_alt")
      .eq("id", variantId)
      .eq("product_id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Variant not found." }, { status: 404 });
    }

    const existingRow = existing as {
      id: string;
      product_id: string;
      stock_quantity: number;
      image_url: string | null;
      image_alt: string | null;
    };

    if (
      payload.stock_quantity !== undefined &&
      payload.stock_quantity !== existingRow.stock_quantity
    ) {
      return NextResponse.json(
        {
          error:
            "Variant stock cannot be overwritten directly. Use the variant stock adjustment control with a required note."
        },
        { status: 400 }
      );
    }

    if (payload.cost_price !== undefined && !canManageCost) {
      return NextResponse.json(
        { error: "Only the store owner can modify cost prices." },
        { status: 403 }
      );
    }

    const nextImageUrl =
      payload.image_url !== undefined ? payload.image_url : existingRow.image_url;
    const nextImageAlt =
      payload.image_alt !== undefined ? payload.image_alt : existingRow.image_alt;
    if (nextImageUrl && !nextImageAlt?.trim()) {
      return NextResponse.json(
        { error: "Alt text is required when a variant image is set." },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.option_values !== undefined) updates.option_values = payload.option_values;
    if (payload.sku !== undefined) updates.sku = payload.sku.toUpperCase();
    if (payload.price_override !== undefined) {
      updates.price_override =
        payload.price_override != null
          ? toMoneyString(payload.price_override)
          : null;
    }
    if (payload.compare_at_price !== undefined) {
      updates.compare_at_price =
        payload.compare_at_price != null
          ? toMoneyString(payload.compare_at_price)
          : null;
    }
    if (canManageCost && payload.cost_price !== undefined) {
      updates.cost_price =
        payload.cost_price != null ? toMoneyString(payload.cost_price) : null;
    }
    if (payload.image_url !== undefined) updates.image_url = payload.image_url;
    if (payload.image_alt !== undefined) updates.image_alt = payload.image_alt;
    if (payload.sort_order !== undefined) updates.sort_order = payload.sort_order;
    if (payload.active !== undefined) updates.active = payload.active;

    const { data, error } = await supabase
      .from("product_variants")
      .update(updates as never)
      .eq("id", variantId)
      .eq("product_id", id)
      .select("*")
      .single();

    if (error) {
      if (
        error.code === "23505" ||
        error.message.toLowerCase().includes("duplicate")
      ) {
        return NextResponse.json(
          { error: "Another variant already uses this SKU." },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    revalidateProductCatalog();
    const variant = canManageCost
      ? (data as ProductVariant)
      : stripVariantCostPrice(data as ProductVariant);

    return NextResponse.json({ variant });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid variant update."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update variant.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    await assertAdminRequest();
    const { id, variantId } = paramsSchema.parse(await context.params);
    const supabase = createAdminSupabaseClient();

    const { count: orderCount } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("variant_id", variantId);

    if ((orderCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "This variant has existing orders and cannot be deleted. Deactivate it instead.",
          hasOrders: true
        },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("product_variants")
      .delete()
      .eq("id", variantId)
      .eq("product_id", id);

    if (error) {
      if (error.message.includes("Deactivate it instead")) {
        return NextResponse.json({ error: error.message, hasOrders: true }, { status: 409 });
      }
      throw new Error(error.message);
    }

    revalidateProductCatalog();
    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid variant ID."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to delete variant.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

