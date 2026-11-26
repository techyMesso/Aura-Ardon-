import { NextResponse, type NextRequest } from "next/server";

import { hasPublicSupabaseEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 10;

function sanitizeIlike(value: string): string {
  return value.replace(/[%_,()]/g, " ").trim();
}

function rankProduct(product: Product, queryLower: string, tokens: string[]): number {
  const title = product.title.toLowerCase();
  const category = product.category.toLowerCase();
  const material = (product.material ?? "").toLowerCase();
  const description = product.description.toLowerCase();

  let score = 0;
  if (title === queryLower) score += 120;
  else if (title.startsWith(queryLower)) score += 85;
  else if (title.includes(queryLower)) score += 60;

  if (category.includes(queryLower)) score += 40;
  if (material.includes(queryLower)) score += 30;
  if (description.includes(queryLower)) score += 15;

  for (const token of tokens) {
    if (title.includes(token)) score += 18;
    if (category.includes(token)) score += 10;
    if (material.includes(token)) score += 8;
    if (description.includes(token)) score += 4;
  }

  if (product.stock_quantity > 0) score += 5;
  if (product.is_featured) score += 2;
  return score;
}

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (rawQuery.length < 2) {
    return NextResponse.json({ query: rawQuery, results: [] });
  }

  if (!hasPublicSupabaseEnv()) {
    return NextResponse.json({ query: rawQuery, results: [] });
  }

  try {
    const supabase = createPublicServerSupabaseClient();
    const cleaned = sanitizeIlike(rawQuery);
    if (!cleaned) {
      return NextResponse.json({ query: rawQuery, results: [] });
    }

    const pattern = `%${cleaned}%`;
    const tokens = cleaned.toLowerCase().split(/\s+/).filter(Boolean);

    // Combine Postgres full-text search (when column exists) + ilike substring match
    // (products.active is kept synchronized with status = 'active' via DB trigger and RLS)
    const [ftsResponse, ilikeResponse] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, title, slug, description, category, category_id, price, compare_at_price, stock_quantity, material, images, image_alts, is_featured, active, status, blur_data_url, created_at"
        )
        .eq("status", "active")
        .textSearch("search_tsv", cleaned, { type: "websearch", config: "english" })
        .limit(20),
      supabase
        .from("products")
        .select(
          "id, title, slug, description, category, category_id, price, compare_at_price, stock_quantity, material, images, image_alts, is_featured, active, status, blur_data_url, created_at"
        )
        .eq("status", "active")
        .or(
          `title.ilike.${pattern},description.ilike.${pattern},category.ilike.${pattern},material.ilike.${pattern}`
        )
        .limit(25)
    ]);

    const mergedById = new Map<string, Product>();

    if (!ftsResponse.error && Array.isArray(ftsResponse.data)) {
      for (const row of ftsResponse.data as Product[]) {
        mergedById.set(row.id, row);
      }
    }

    if (!ilikeResponse.error && Array.isArray(ilikeResponse.data)) {
      for (const row of ilikeResponse.data as Product[]) {
        mergedById.set(row.id, row);
      }
    }

    if (ftsResponse.error && ilikeResponse.error) {
      throw new Error(ilikeResponse.error.message);
    }

    const queryLower = cleaned.toLowerCase();
    const ranked = [...mergedById.values()]
      .sort(
        (left, right) =>
          rankProduct(right, queryLower, tokens) -
          rankProduct(left, queryLower, tokens)
      )
      .slice(0, MAX_RESULTS);

    return NextResponse.json({
      query: rawQuery,
      results: ranked
    });
  } catch (caughtError) {
    logger.error("Catalog search failed", {
      query: rawQuery,
      error: caughtError instanceof Error ? caughtError.message : String(caughtError)
    });
    return NextResponse.json(
      { error: "Unable to complete search.", results: [] },
      { status: 500 }
    );
  }
}

