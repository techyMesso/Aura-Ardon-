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
  productUpdateSchema
} from "@/lib/admin-product-input";
import { revalidateProductCatalog } from "@/lib/cache";
import { toCatalogSlug } from "@/lib/catalog";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Product, ProductUpdate } from "@/lib/types";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const STORAGE_PUBLIC_PREFIX = "/storage/v1/object/public/product-images/";

function extractStoragePath(url: string): string | null {
  try {
    const parsed = new URL(url);
    const index = parsed.pathname.indexOf(STORAGE_PUBLIC_PREFIX);
    if (index === -1) return null;
    return decodeURIComponent(
      parsed.pathname.slice(index + STORAGE_PUBLIC_PREFIX.length)
    );
  } catch {
    return null;
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const canManageCost = isOwnerUser(adminUser);
    const { id } = z.object({ id: z.string().uuid() }).parse(await context.params);
    const payload = productUpdateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const updates: ProductUpdate = {};
    const { data: existingProduct } = await supabase
      .from("products")
      .select("slug, stock_quantity, price, compare_at_price, status")
      .eq("id", id)
      .maybeSingle();

    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const existingRow = existingProduct as {
      slug: string | null;
      stock_quantity: number;
      price: string | number;
      compare_at_price?: string | number | null;
      status?: string | null;
    };
    const currentStock = existingRow.stock_quantity;
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

    const effectivePrice =
      payload.price !== undefined ? payload.price : Number(existingRow.price);
    const effectiveCompareAt =
      payload.compare_at_price !== undefined
        ? payload.compare_at_price
        : existingRow.compare_at_price != null
          ? Number(existingRow.compare_at_price)
          : null;

    if (effectiveCompareAt !== null && effectiveCompareAt <= effectivePrice) {
      return NextResponse.json(
        { error: "Compare-at price must be higher than the selling price." },
        { status: 400 }
      );
    }

    if (payload.title !== undefined) {
      updates.title = payload.title;
      if (!existingRow.slug && !payload.slug) {
        const candidateSlug = toCatalogSlug(payload.title);
        if (candidateSlug) {
          updates.slug = candidateSlug;
        }
      }
    }

    if (payload.slug !== undefined && payload.slug !== null) {
      const normalizedSlug = toCatalogSlug(payload.slug);
      if (!normalizedSlug) {
        return NextResponse.json(
          { error: "Slug must contain at least one letter or number." },
          { status: 400 }
        );
      }
      updates.slug = normalizedSlug;
    }

    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.price !== undefined) updates.price = toMoneyString(payload.price);
    if (payload.compare_at_price !== undefined) {
      updates.compare_at_price =
        payload.compare_at_price != null
          ? toMoneyString(payload.compare_at_price)
          : null;
    }
    if (payload.cost_price !== undefined) {
      if (!canManageCost) {
        return NextResponse.json(
          { error: "Only the store owner can modify cost prices." },
          { status: 403 }
        );
      }
      updates.cost_price =
        payload.cost_price != null ? toMoneyString(payload.cost_price) : null;
    }
    if (payload.category_id !== undefined) {
      const category = await getSelectedProductCategory(payload.category_id);
      updates.category = category.name;
      updates.category_id = category.id;
    }
    if (payload.material !== undefined) updates.material = payload.material;
    if (payload.finish !== undefined) updates.finish = payload.finish;
    if (payload.size_label !== undefined) updates.size_label = payload.size_label;
    if (payload.water_resistance !== undefined) {
      updates.water_resistance = payload.water_resistance;
    }
    if (payload.warranty !== undefined) updates.warranty = payload.warranty;
    if (payload.ingredients !== undefined) updates.ingredients = payload.ingredients;
    if (payload.net_weight !== undefined) updates.net_weight = payload.net_weight;
    if (payload.expiry_info !== undefined) updates.expiry_info = payload.expiry_info;
    if (payload.in_the_box !== undefined) updates.in_the_box = payload.in_the_box;
    if (payload.care !== undefined) updates.care = payload.care;
    if (payload.images !== undefined) updates.images = payload.images;
    if (payload.image_alts !== undefined) updates.image_alts = payload.image_alts;
    if (payload.status !== undefined) {
      updates.status = payload.status;
      updates.active = payload.status === "active";
    } else if (payload.active !== undefined) {
      updates.active = payload.active;
      updates.status = payload.active
        ? "active"
        : existingRow.status === "archived"
          ? "archived"
          : "draft";
    }
    if (payload.is_featured !== undefined) updates.is_featured = payload.is_featured;
    if (payload.featured_order !== undefined) {
      updates.featured_order = payload.featured_order;
    }
    if (payload.is_new_in !== undefined) updates.is_new_in = payload.is_new_in;
    if (payload.new_in_order !== undefined) updates.new_in_order = payload.new_in_order;

    const { data, error } = await supabase
      .from("products")
      .update(updates as never)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (
        error.code === "23505" ||
        error.message.toLowerCase().includes("duplicate")
      ) {
        return NextResponse.json(
          { error: "Another product already uses this slug." },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    revalidateProductCatalog();

    const product = canManageCost
      ? (data as Product)
      : stripProductCostPrice(data as Product);

    const priceChanged =
      payload.price !== undefined ||
      payload.compare_at_price !== undefined ||
      payload.cost_price !== undefined;

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: adminUser?.email ?? "admin",
        role: canManageCost ? "owner" : "staff"
      },
      action: priceChanged ? "product.price_updated" : "product.updated",
      entity: "product",
      entityId: id,
      before: existingRow,
      after: updates
    });

    const slugChanged = Boolean(
      existingRow.slug &&
        updates.slug &&
        existingRow.slug.toLowerCase() !== updates.slug.toLowerCase()
    );

    return NextResponse.json({
      product,
      redirectCreated: slugChanged
        ? {
            from: `/p/${existingRow.slug}`,
            to: `/p/${updates.slug}`,
            statusCode: 301
          }
        : null
    });
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
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = z.object({ id: z.string().uuid() }).parse(await context.params);
    const { searchParams } = new URL(request.url);
    const archiveIfOrdered = searchParams.get("archiveIfOrdered") === "1";

    const supabase = createAdminSupabaseClient();

    // Never hard-delete a product that has orders; archive it instead.
    const { count: orderItemCount } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id);

    if ((orderItemCount ?? 0) > 0) {
      if (archiveIfOrdered) {
        const { data: archived, error: archiveError } = await supabase
          .from("products")
          .update({ status: "archived", active: false } as never)
          .eq("id", id)
          .select("id, title, status, active")
          .single();

        if (archiveError) {
          throw new Error(archiveError.message);
        }

        revalidateProductCatalog();
        await recordAuditLog({
          actor: {
            id: adminUser?.id ?? null,
            email: adminUser?.email ?? "admin",
            role: isOwnerUser(adminUser) ? "owner" : "staff"
          },
          action: "product.archived",
          entity: "product",
          entityId: id,
          after: { status: "archived", active: false }
        });
        return NextResponse.json({
          ok: true,
          archived: true,
          product: archived,
          message:
            "This product has existing orders, so it was archived instead of deleted."
        });
      }

      return NextResponse.json(
        {
          error:
            "This product has existing orders and cannot be deleted. Archive it instead so old orders and invoices remain intact.",
          hasOrders: true
        },
        { status: 409 }
      );
    }

    const { data: existing } = await supabase
      .from("products")
      .select("images")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      if (error.message.includes("Archive it instead")) {
        return NextResponse.json(
          { error: error.message, hasOrders: true },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    // Best-effort cleanup of orphaned product images in Supabase Storage.
    const candidateImages = (
      (existing as { images?: string[] } | null)?.images ?? []
    ).filter(Boolean);
    if (candidateImages.length > 0 && supabase.storage) {
      try {
        const { data: remainingProducts } = await supabase
          .from("products")
          .select("images");
        const referencedUrls = new Set<string>();
        for (const row of (remainingProducts ?? []) as Array<{
          images?: string[] | null;
        }>) {
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
          error:
            storageError instanceof Error
              ? storageError.message
              : String(storageError)
        });
      }
    }

    revalidateProductCatalog();

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: adminUser?.email ?? "admin",
        role: isOwnerUser(adminUser) ? "owner" : "staff"
      },
      action: "product.deleted",
      entity: "product",
      entityId: id
    });

    return NextResponse.json({ ok: true, deleted: true });
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
