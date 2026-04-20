import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().min(12).optional(),
  price: z.coerce.number().positive().optional(),
  stock_quantity: z.coerce.number().int().min(0).optional(),
  category: z.string().min(2).max(80).optional(),
  material: z.string().max(80).nullable().optional(),
  images: z.array(z.string().url()).min(1).optional(),
  active: z.boolean().optional(),
  is_featured: z.boolean().optional()
});

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
    if (payload.title !== undefined) updates.title = payload.title;
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.price !== undefined) updates.price = toMoneyString(payload.price);
    if (payload.stock_quantity !== undefined) updates.stock_quantity = payload.stock_quantity;
    if (payload.category !== undefined) updates.category = payload.category;
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
