import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { revalidateCategoryCatalog, revalidateProductCatalog } from "@/lib/cache";
import { toCatalogSlug } from "@/lib/catalog";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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

const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(100),
  slug: nullableOptionalString(120),
  description: nullableOptionalString(500),
  image_url: nullableOptionalUrl,
  parent_id: nullableOptionalUuid,
  display_order: z.coerce.number().int().min(0).default(0)
});

function getErrorStatus(error: unknown) {
  if (error instanceof z.ZodError) return 400;
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHORIZED") return 401;
  if (message.toLowerCase().includes("duplicate key")) return 409;
  return 400;
}

export async function GET() {
  try {
    await assertAdminRequest();
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load categories.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    await assertAdminRequest();
    const payload = categoryCreateSchema.parse(await request.json());
    const slug = toCatalogSlug(payload.slug || payload.name);

    if (!slug) {
      return NextResponse.json(
        { error: "Category name must contain at least one letter or number." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("categories")
      .insert({
        name: payload.name,
        slug,
        description: payload.description ?? null,
        image_url: payload.image_url ?? null,
        parent_id: payload.parent_id ?? null,
        display_order: payload.display_order
      } as never)
      .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
      .single();

    if (error) {
      if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { error: `A category with slug "${slug}" already exists.` },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    revalidateCategoryCatalog();
    revalidateProductCatalog();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "Invalid category payload."
        : err instanceof Error
          ? err.message
          : "Unable to create category.";
    return NextResponse.json({ error: message }, { status: getErrorStatus(err) });
  }
}
