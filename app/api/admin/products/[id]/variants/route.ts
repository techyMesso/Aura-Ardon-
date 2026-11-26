import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertAdminRequest,
  isOwnerUser,
  stripVariantCostPrice
} from "@/lib/auth";
import { variantCreateSchema } from "@/lib/admin-product-input";
import { revalidateProductCatalog } from "@/lib/cache";
import { listProductVariantsAdmin } from "@/lib/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ProductVariant } from "@/lib/types";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid product ID.")
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const variants = await listProductVariantsAdmin(id, {
      includeCostPrice: isOwnerUser(adminUser)
    });
    return NextResponse.json({ variants });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid product ID."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load variants.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const canManageCost = isOwnerUser(adminUser);
    const { id } = idParamSchema.parse(await context.params);
    const payload = variantCreateSchema.parse(await request.json());

    if (payload.cost_price !== undefined && !canManageCost) {
      return NextResponse.json(
        { error: "Only the store owner can set cost prices." },
        { status: 403 }
      );
    }

    const supabase = createAdminSupabaseClient();

    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const insertRow: Record<string, unknown> = {
      product_id: id,
      name: payload.name,
      option_values: payload.option_values ?? {},
      sku: payload.sku.toUpperCase(),
      price_override:
        payload.price_override != null
          ? toMoneyString(payload.price_override)
          : null,
      compare_at_price:
        payload.compare_at_price != null
          ? toMoneyString(payload.compare_at_price)
          : null,
      stock_quantity: payload.stock_quantity,
      image_url: payload.image_url ?? null,
      image_alt: payload.image_alt ?? null,
      sort_order: payload.sort_order ?? 0,
      active: payload.active ?? true
    };

    if (canManageCost && payload.cost_price !== undefined) {
      insertRow.cost_price =
        payload.cost_price != null ? toMoneyString(payload.cost_price) : null;
    }

    const { data, error } = await supabase
      .from("product_variants")
      .insert(insertRow as never)
      .select("*")
      .single();

    if (error) {
      if (
        error.code === "23505" ||
        error.message.toLowerCase().includes("duplicate")
      ) {
        return NextResponse.json(
          { error: `SKU "${payload.sku.toUpperCase()}" is already in use by another variant.` },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    revalidateProductCatalog();
    const variant = canManageCost
      ? (data as ProductVariant)
      : stripVariantCostPrice(data as ProductVariant);

    return NextResponse.json({ variant }, { status: 201 });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid variant payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to create variant.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

