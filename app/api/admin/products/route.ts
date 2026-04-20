import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const productSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(12),
  price: z.coerce.number().positive(),
  stock_quantity: z.coerce.number().int().min(0),
  category: z.string().min(2).max(80),
  material: z.string().max(80).nullable().optional(),
  images: z.array(z.string().url()).min(1),
  active: z.boolean().optional(),
  is_featured: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    await assertAdminRequest();
    const payload = productSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .insert({
        title: payload.title,
        description: payload.description,
        price: toMoneyString(payload.price),
        stock_quantity: payload.stock_quantity,
        category: payload.category,
        material: payload.material || null,
        images: payload.images,
        active: payload.active ?? true,
        is_featured: payload.is_featured ?? false,
        slug: null
      } as never)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ product: data }, { status: 201 });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to create product.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
