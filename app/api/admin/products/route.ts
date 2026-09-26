import { NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/auth";
import { getSelectedProductCategory, productCreateSchema } from "@/lib/admin-product-input";
import { revalidateProductCatalog } from "@/lib/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

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
    const payload = productCreateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();
    const category = await getSelectedProductCategory(payload.category_id);
    const slug = createProductSlug(payload.title);
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

    revalidateProductCatalog();

    return NextResponse.json({ product: data }, { status: 201 });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to create product.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
