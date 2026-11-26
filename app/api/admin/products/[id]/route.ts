import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getSelectedProductCategory, productUpdateSchema } from "@/lib/admin-product-input";
import { revalidateProductCatalog } from "@/lib/cache";
import { toCatalogSlug } from "@/lib/catalog";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ProductUpdate } from "@/lib/types";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const STORAGE_PUBLIC_PREFIX = "/storage/v1/object/public/product-images/";

function extractStoragePath(url: string): string | null {
  try {
    const parsed = new URL(url);
    const index = parsed.pathname.indexOf(STORAGE_PUBLIC_PREFIX);
    if (index === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(index + STORAGE_PUBLIC_PREFIX.length));
  } catch {
    return null;
  }
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
    const { data: existingProduct } = await supabase
      .from("products")
      .select("slug, stock_quantity")
      .eq("id", id)
      .maybeSingle();

    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const currentStock = (existingProduct as { stock_quantity: number }).stock_quantity;
    if (
      payload.stock_quantity !== undefined &&
      payload.stock_quantity !== currentStock
    ) {
      return NextResponse.json(
        {
          error:
            "Stock cannot be overwritten directly. Use the Stock Ledger adjustment form with a required note."
        },
        { status: 400 }
      );
    }

    if (payload.title !== undefined) {
      updates.title = payload.title;
      // Only backfill slug if the existing product does not have one yet so live /p/[slug] URLs stay stable.
      if (!(existingProduct as { slug: string | null }).slug) {
        const candidateSlug = toCatalogSlug(payload.title);
        if (candidateSlug) {
          updates.slug = candidateSlug;
        }
      }
    }
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.price !== undefined) updates.price = toMoneyString(payload.price);
    if (payload.category_id !== undefined) {
      const category = await getSelectedProductCategory(payload.category_id);
      updates.category = category.name;
      updates.category_id = category.id;
    }
    if (payload.material !== undefined) updates.material = payload.material;
    if (payload.finish !== undefined) updates.finish = payload.finish;
    if (payload.size_label !== undefined) updates.size_label = payload.size_label;
    if (payload.in_the_box !== undefined) updates.in_the_box = payload.in_the_box;
    if (payload.care !== undefined) updates.care = payload.care;
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
      if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { error: "Another product already uses this slug." },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    revalidateProductCatalog();

    return NextResponse.json({ product: data });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid product update."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update product.";
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

    const { data: existing } = await supabase
      .from("products")
      .select("images")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    // Best-effort cleanup of orphaned product images in Supabase Storage.
    const candidateImages = ((existing as { images?: string[] } | null)?.images ?? []).filter(
      Boolean
    );
    if (candidateImages.length > 0 && supabase.storage) {
      try {
        const { data: remainingProducts } = await supabase
          .from("products")
          .select("images");
        const referencedUrls = new Set<string>();
        for (const row of (remainingProducts ?? []) as Array<{ images?: string[] | null }>) {
          for (const imageUrl of row.images ?? []) {
            referencedUrls.add(imageUrl);
          }
        }
        const storagePaths = candidateImages
          .filter(url => !referencedUrls.has(url))
          .map(extractStoragePath)
          .filter((path): path is string => Boolean(path));

        if (storagePaths.length > 0) {
          await supabase.storage.from("product-images").remove(storagePaths);
        }
      } catch (storageError) {
        logger.warn("Unable to clean up deleted product images", {
          productId: id,
          error: storageError instanceof Error ? storageError.message : String(storageError)
        });
      }
    }

    revalidateProductCatalog();

    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid product ID."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to delete product.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
