import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().min(12).optional(),
  price: z.coerce.number().positive().optional(),
  stock_quantity: z.coerce.number().int().min(0).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  material: z.string().trim().min(1, "Material cannot be empty.").max(80).optional(),
  images: z.array(z.string().url()).min(1).optional(),
  active: z.boolean().optional(),
  is_featured: z.boolean().optional()
});

async function resolveCategoryId(category: string) {
  const supabase = createAdminSupabaseClient();
  const normalizedCategory = category.trim();
  const normalizedSlug = normalizedCategory
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug")
    .or(`name.ilike.${normalizedCategory},slug.eq.${normalizedSlug}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const categoryRecord = data as { id: string } | null;
  return categoryRecord?.id ?? null;
}

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
    const { id } = await context.params;
    const payload = updateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const updates: Record<string, any> = {};
    if (payload.title !== undefined) {
      updates.title = payload.title;
      updates.slug = createProductSlug(payload.title);
    }
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.price !== undefined) updates.price = toMoneyString(payload.price);
    if (payload.stock_quantity !== undefined) updates.stock_quantity = payload.stock_quantity;
    if (payload.category !== undefined) {
      updates.category = payload.category;
      updates.category_id = await resolveCategoryId(payload.category);
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
    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to delete product.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
