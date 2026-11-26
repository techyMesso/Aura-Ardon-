import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest, isOwnerUser } from "@/lib/auth";
import { revalidateProductCatalog } from "@/lib/cache";
import { PUBLIC_PRODUCT_SELECT } from "@/lib/data";
import { buildProductImportDryRun } from "@/lib/product-csv";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Category, Product } from "@/lib/types";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const importRequestSchema = z.object({
  csvText: z.string().min(1, "Paste or upload a CSV file first.").max(1_000_000),
  mode: z.enum(["dry_run", "apply"]).default("dry_run"),
  stockNote: z.string().trim().max(240).optional()
});

export async function POST(request: Request) {
  try {
    const adminUser = await assertAdminRequest();
    const canEditCostPrice = isOwnerUser(adminUser);
    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const payload = importRequestSchema.parse(await request.json());

    const supabase = createAdminSupabaseClient();

    const [
      { data: existingProducts, error: prodError },
      { data: categories, error: catError },
      { data: variantRows }
    ] = await Promise.all([
      supabase.from("products").select(PUBLIC_PRODUCT_SELECT),
      supabase
        .from("categories")
        .select("id, name, slug, parent_id, description, image_url, display_order, active, created_at"),
      supabase.from("product_variants").select("product_id")
    ]);

    if (prodError) throw new Error(prodError.message);
    if (catError) throw new Error(catError.message);

    const productsWithVariants = new Set(
      ((variantRows ?? []) as Array<{ product_id: string }>).map(v => v.product_id)
    );

    const existingList = ((existingProducts ?? []) as unknown as Product[]).map(product => ({
      ...product,
      has_variants: productsWithVariants.has(product.id)
    }));

    const dryRun = buildProductImportDryRun({
      csvText: payload.csvText,
      existingProducts: existingList,
      categories: (categories ?? []) as Category[],
      canEditCostPrice
    });

    if (payload.mode === "dry_run") {
      return NextResponse.json({ ok: true, mode: "dry_run", summary: dryRun });
    }

    if (dryRun.errorCount > 0) {
      return NextResponse.json(
        {
          error: `Import blocked: fix ${dryRun.errorCount} row error${dryRun.errorCount === 1 ? "" : "s"} before applying.`,
          summary: dryRun
        },
        { status: 400 }
      );
    }

    if (dryRun.stockAdjustCount > 0 && (!payload.stockNote || payload.stockNote.trim().length < 2)) {
      return NextResponse.json(
        {
          error:
            "A stock adjustment note is required when CSV import changes stock quantities (all stock changes go through the ledger).",
          summary: dryRun
        },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    let stockAdjusted = 0;

    for (const row of dryRun.rows) {
      if (!row.normalized) continue;
      const item = row.normalized;

      if (row.action === "create") {
        const insertData: Record<string, unknown> = {
          slug: item.slug,
          title: item.title,
          status: item.status,
          active: item.status === "active",
          category_id: item.category_id,
          category: item.category_name,
          price: toMoneyString(item.price),
          compare_at_price:
            item.compare_at_price != null
              ? toMoneyString(item.compare_at_price)
              : null,
          stock_quantity: item.stock_quantity,
          material: item.material,
          finish: item.finish,
          size_label: item.size_label,
          in_the_box: item.in_the_box,
          care: item.care,
          is_featured: item.is_featured,
          featured_order: item.featured_order,
          is_new_in: item.is_new_in,
          new_in_order: item.new_in_order,
          images: item.images,
          image_alts: item.image_alts,
          description: item.description
        };
        if (canEditCostPrice && item.cost_price !== undefined) {
          insertData.cost_price =
            item.cost_price != null ? toMoneyString(item.cost_price) : null;
        }

        const { error: insertErr } = await supabase
          .from("products")
          .insert(insertData as never);
        if (insertErr) {
          throw new Error(`Row ${row.rowNumber} (${item.slug}): ${insertErr.message}`);
        }
        created += 1;
      } else if (row.action === "update" && row.existingProductId) {
        const updateData: Record<string, unknown> = {
          title: item.title,
          status: item.status,
          active: item.status === "active",
          category_id: item.category_id,
          category: item.category_name,
          price: toMoneyString(item.price),
          compare_at_price:
            item.compare_at_price != null
              ? toMoneyString(item.compare_at_price)
              : null,
          material: item.material,
          finish: item.finish,
          size_label: item.size_label,
          in_the_box: item.in_the_box,
          care: item.care,
          is_featured: item.is_featured,
          featured_order: item.featured_order,
          is_new_in: item.is_new_in,
          new_in_order: item.new_in_order,
          images: item.images,
          image_alts: item.image_alts,
          description: item.description
        };
        if (canEditCostPrice && item.cost_price !== undefined) {
          updateData.cost_price =
            item.cost_price != null ? toMoneyString(item.cost_price) : null;
        }

        const { error: updateErr } = await supabase
          .from("products")
          .update(updateData as never)
          .eq("id", row.existingProductId);
        if (updateErr) {
          throw new Error(`Row ${row.rowNumber} (${item.slug}): ${updateErr.message}`);
        }

        // Stock edits ALWAYS go through the stock ledger RPC
        if (row.stockDelta !== 0) {
          const { error: stockErr } = await supabase
            .rpc("adjust_product_stock" as never, {
              p_product_id: row.existingProductId,
              p_change: row.stockDelta,
              p_note: `CSV import: ${payload.stockNote?.trim() || "Catalog sync"}`,
              p_changed_by: actor,
              p_type: "manual_adjustment"
            } as never)
            .single();

          if (stockErr) {
            throw new Error(
              `Row ${row.rowNumber} (${item.slug}) stock ledger error: ${stockErr.message}`
            );
          }
          stockAdjusted += 1;
        }

        updated += 1;
      }
    }

    revalidateProductCatalog();

    return NextResponse.json({
      ok: true,
      mode: "apply",
      created,
      updated,
      stockAdjusted,
      summary: dryRun
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid CSV import request."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to process CSV import.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

