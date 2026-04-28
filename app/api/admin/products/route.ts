import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const productSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(12),
  price: z.coerce.number().positive(),
  stock_quantity: z.coerce.number().int().min(0),
  category: z.string().trim().min(2).max(80),
  material: z.string().trim().min(1, "Material is required.").max(80),
  images: z.array(z.string().url()).min(1),
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

export async function POST(request: Request) {
  try {
    await assertAdminRequest();
    const payload = productSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();
    const categoryId = await resolveCategoryId(payload.category);
    const slug = createProductSlug(payload.title);
    const { data, error } = await supabase
      .from("products")
      .insert({
        title: payload.title,
        description: payload.description,
        price: toMoneyString(payload.price),
        stock_quantity: payload.stock_quantity,
        category: payload.category,
        category_id: categoryId,
        material: payload.material,
        images: payload.images,
        active: payload.active ?? true,
        is_featured: payload.is_featured ?? false,
        slug
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
