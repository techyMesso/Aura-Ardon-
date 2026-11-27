import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import {
  assertAdminRequest,
  isOwnerUser,
  stripProductCostPrice
} from "@/lib/auth";
import {
  getSelectedProductCategory,
  productCreateSchema
} from "@/lib/admin-product-input";
import { revalidateProductCatalog } from "@/lib/cache";
import { toCatalogSlug } from "@/lib/catalog";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Product } from "@/lib/types";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

async function resolveUniqueProductSlug(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  baseInput: string
) {
  const baseSlug = toCatalogSlug(baseInput) || `piece-${Date.now()}`;
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
    const adminUser = await assertAdminRequest();
    const canManageCost = isOwnerUser(adminUser);
    const payload = productCreateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();
    const category = await getSelectedProductCategory(payload.category_id);
    const slug = await resolveUniqueProductSlug(
      supabase,
      payload.slug || payload.title
    );

    const status =
      payload.status ?? (payload.active === false ? "draft" : "active");

    const insertRow: Record<string, unknown> = {
      title: payload.title,
      description: payload.description,
      price: toMoneyString(payload.price),
      compare_at_price:
        payload.compare_at_price != null
          ? toMoneyString(payload.compare_at_price)
          : null,
      stock_quantity: payload.stock_quantity,
      category: category.name,
      category_id: category.id,
      material: payload.material,
      finish: payload.finish ?? null,
      size_label: payload.size_label ?? null,
      water_resistance: payload.water_resistance ?? null,
      warranty: payload.warranty ?? null,
      ingredients: payload.ingredients ?? null,
      net_weight: payload.net_weight ?? null,
      expiry_info: payload.expiry_info ?? null,
      in_the_box: payload.in_the_box ?? null,
      care: payload.care ?? null,
      images: payload.images,
      image_alts: payload.image_alts,
      status,
      active: status === "active",
      is_featured: payload.is_featured ?? false,
      featured_order: payload.featured_order ?? 0,
      is_new_in: payload.is_new_in ?? false,
      new_in_order: payload.new_in_order ?? 0,
      slug
    };

    if (canManageCost && payload.cost_price !== undefined) {
      insertRow.cost_price =
        payload.cost_price != null ? toMoneyString(payload.cost_price) : null;
    }

    const { data, error } = await supabase
      .from("products")
      .insert(insertRow as never)
      .select("*")
      .single();

    if (error) {
      if (
        error.code === "23505" ||
        error.message.toLowerCase().includes("duplicate")
      ) {
        return NextResponse.json(
          {
            error:
              "A product with a conflicting slug already exists. Try a more specific title or slug."
          },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    revalidateProductCatalog();

    const product = canManageCost
      ? (data as Product)
      : stripProductCostPrice(data as Product);

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: adminUser?.email ?? "admin",
        role: canManageCost ? "owner" : "staff"
      },
      action: "product.created",
      entity: "product",
      entityId: product.id,
      after: {
        title: product.title,
        slug: product.slug,
        price: product.price,
        stock_quantity: product.stock_quantity,
        status: product.status
      }
    });

    return NextResponse.json({ product }, { status: 201 });
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
