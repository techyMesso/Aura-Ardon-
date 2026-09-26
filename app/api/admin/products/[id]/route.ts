import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { getSelectedProductCategory, productUpdateSchema } from "@/lib/admin-product-input";
import { revalidateProductCatalog } from "@/lib/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ProductUpdate } from "@/lib/types";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

function createProductSlug(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = z.object({ id: z.string().uuid() }).parse(await context.params);
    const payload = productUpdateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const updates: ProductUpdate = {};
    if (payload.title !== undefined) {
      updates.title = payload.title;
      updates.slug = createProductSlug(payload.title);
    }
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.price !== undefined) updates.price = toMoneyString(payload.price);
    if (payload.stock_quantity !== undefined) updates.stock_quantity = payload.stock_quantity;
    if (payload.category_id !== undefined) {
      const category = await getSelectedProductCategory(payload.category_id);
      updates.category = category.name;
      updates.category_id = category.id;
    }
    if (payload.material !== undefined) updates.material = payload.material;
    if (payload.images !== undefined) updates.images = payload.images;
    if (payload.active !== undefined) updates.active = payload.active;
    if (payload.is_featured !== undefined) updates.is_featured = payload.is_featured;

    const { data, error } = await supabase
      .from("products")
      .update(updates as never)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    revalidateProductCatalog();

    return NextResponse.json({ product: data });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to update product.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = z.object({ id: z.string().uuid() }).parse(await context.params);
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    revalidateProductCatalog();

    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to delete product.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
