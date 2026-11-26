import { NextResponse } from "next/server";

import { assertAdminRequest, isOwnerUser } from "@/lib/auth";
import { OWNER_PRODUCT_SELECT, PUBLIC_PRODUCT_SELECT } from "@/lib/data";
import { buildProductsCsv } from "@/lib/product-csv";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Category, Product } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminUser = await assertAdminRequest();
    const includeCostPrice = isOwnerUser(adminUser);
    const supabase = createAdminSupabaseClient();

    const productColumns = includeCostPrice
      ? OWNER_PRODUCT_SELECT
      : PUBLIC_PRODUCT_SELECT;

    const [{ data: products, error: prodError }, { data: categories, error: catError }] =
      await Promise.all([
        supabase
          .from("products")
          .select(productColumns)
          .order("created_at", { ascending: false }),
        supabase
          .from("categories")
          .select("id, name, slug, parent_id, description, image_url, display_order, active, created_at")
          .order("display_order", { ascending: true })
      ]);

    if (prodError) throw new Error(prodError.message);
    if (catError) throw new Error(catError.message);

    const csv = buildProductsCsv(
      (products ?? []) as unknown as Product[],
      (categories ?? []) as Category[],
      { includeCostPrice }
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="auro-ardon-products.csv"',
        "Cache-Control": "private, no-store"
      }
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to export products CSV.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

