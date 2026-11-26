import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getSelectedProductCategory, productCreateSchema } from "@/lib/admin-product-input";
import { revalidateProductCatalog } from "@/lib/cache";
import { toCatalogSlug } from "@/lib/catalog";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

async function resolveUniqueProductSlug(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  baseTitle: string
) {
  const baseSlug = toCatalogSlug(baseTitle) || `piece-${Date.now()}`;
  const query = supabase.from("products");

  // Support lightweight unit test mocks that only expose insert() on products.
  if (typeof query.select !== "function") {
    return baseSlug;
  }

  const { data } = await query
    .select("slug")
    .ilike("slug", `${baseSlug}%`);

  const existing = new Set(
    ((data ?? []) as Array<{ slug: string | null }>)
      .map(row => row.slug?.toLowerCase())
      .filter((value): value is string => Boolean(value))
  );

  if (!existing.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (existing.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseSlug}-${suffix}`;
}

export async function POST(request: Request) {
  try {
    await assertAdminRequest();
    const payload = productCreateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();
    const category = await getSelectedProductCategory(payload.category_id);
    const slug = await resolveUniqueProductSlug(supabase, payload.title);

    const { data, error } = await supabase
      .from("products")
      .insert({
        title: payload.title,
        description: payload.description,
        price: toMoneyString(payload.price),
        stock_quantity: payload.stock_quantity,
        category: category.name,
        category_id: category.id,
        material: payload.material,
        finish: payload.finish ?? null,
        size_label: payload.size_label ?? null,
        in_the_box: payload.in_the_box ?? null,
        care: payload.care ?? null,
        images: payload.images,
        active: payload.active ?? true,
        is_featured: payload.is_featured ?? false,
        slug
      } as never)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { error: "A product with a conflicting slug already exists. Try a more specific title." },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    revalidateProductCatalog();

    return NextResponse.json({ product: data }, { status: 201 });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid product payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to create product.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
