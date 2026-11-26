import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { revalidateCategoryCatalog, revalidateProductCatalog } from "@/lib/cache";
import { toCatalogSlug } from "@/lib/catalog";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { CategoryUpdate } from "@/lib/types";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid category ID.")
});

const nullableOptionalString = (maxLength: number) =>
  z.preprocess(
    value => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maxLength).nullable().optional()
  );

const nullableOptionalUuid = z.preprocess(
  value => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().uuid("Select a valid parent category.").nullable().optional()
);

const nullableOptionalUrl = z.preprocess(
  value => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().url("Enter a valid image URL.").nullable().optional()
);

const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(100).optional(),
  slug: nullableOptionalString(120),
  description: nullableOptionalString(500),
  image_url: nullableOptionalUrl,
  parent_id: nullableOptionalUuid,
  display_order: z.coerce.number().int().min(0).optional()
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "Invalid category ID."
        : err instanceof Error
          ? err.message
          : "Unable to load category.";
    const status = message === "UNAUTHORIZED" ? 401 : err instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = categoryUpdateSchema.parse(await request.json());

    if (payload.parent_id && payload.parent_id === id) {
      return NextResponse.json(
        { error: "A category cannot be its own parent." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const updates: CategoryUpdate = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.slug !== undefined) {
      const normalizedSlug = payload.slug ? toCatalogSlug(payload.slug) : "";
      if (!normalizedSlug) {
        return NextResponse.json(
          { error: "Slug must contain at least one letter or number." },
          { status: 400 }
        );
      }
      updates.slug = normalizedSlug;
    }
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.image_url !== undefined) updates.image_url = payload.image_url;
    if (payload.parent_id !== undefined) updates.parent_id = payload.parent_id;
    if (payload.display_order !== undefined) updates.display_order = payload.display_order;

    const { data, error } = await supabase
      .from("categories")
      .update(updates as never)
      .eq("id", id)
      .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
      .maybeSingle();

    if (error) {
      if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { error: "Another category already uses this slug." },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }
    if (!data) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }

    // Keep denormalized products.category display name synchronized when renamed.
    if (payload.name !== undefined) {
      await supabase
        .from("products")
        .update({ category: payload.name } as never)
        .eq("category_id", id);
    }

    revalidateCategoryCatalog();
    revalidateProductCatalog();
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "Invalid category update."
        : err instanceof Error
          ? err.message
          : "Unable to update category.";
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
    const { id } = idParamSchema.parse(await context.params);
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase.from("categories").delete().eq("id", id);

    if (error) throw new Error(error.message);
    revalidateCategoryCatalog();
    revalidateProductCatalog();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "Invalid category ID."
        : err instanceof Error
          ? err.message
          : "Unable to delete category.";
    const status = message === "UNAUTHORIZED" ? 401 : err instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
