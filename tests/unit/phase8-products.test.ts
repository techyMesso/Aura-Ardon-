import { describe, expect, it } from "vitest";

import {
  getAdminRole,
  isOwnerUser,
  stripProductCostPrice
} from "@/lib/auth";
import {
  analyzeImageDimensions,
  computeResizeDimensions
} from "@/lib/image-processing";
import {
  buildBackInStockWhatsAppUrl,
  buildProductImportDryRun,
  buildProductsCsv
} from "@/lib/product-csv";
import type { Category, Product } from "@/lib/types";

const SAMPLE_CATEGORIES: Category[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Watches",
    slug: "watches",
    parent_id: null,
    description: "Classic Nairobi timepieces",
    image_url: null,
    display_order: 1,
    active: true,
    created_at: "2026-01-01T00:00:00.000Z"
  }
];

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Nairobi Classic Leather Watch",
    slug: "nairobi-classic-leather-watch",
    description: "Refined stainless steel watch with smooth leather strap.",
    category: "Watches",
    category_id: "11111111-1111-4111-8111-111111111111",
    price: "4500.00",
    compare_at_price: "5200.00",
    cost_price: "1900.00",
    stock_quantity: 5,
    material: "Stainless steel",
    images: ["https://scukquqkdivnodefqggf.supabase.co/storage/v1/object/public/product-images/watch.webp"],
    image_alts: ["Nairobi Classic Leather Watch dial view"],
    is_featured: true,
    featured_order: 1,
    is_new_in: true,
    new_in_order: 2,
    active: true,
    status: "active",
    variants: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        product_id: "22222222-2222-4222-8222-222222222222",
        name: "Gold / 40mm",
        option_values: { colour: "Gold", size: "40mm" },
        sku: "AA-WAT-GLD-40",
        price_override: "4800.00",
        cost_price: "2100.00",
        stock_quantity: 5,
        image_url: null,
        image_alt: null,
        sort_order: 0,
        active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      }
    ],
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("Phase 8 product management helpers", () => {
  it("warns when images are under 800 px or not roughly square, and resizes down to max 2000 px", () => {
    const clean = analyzeImageDimensions(1200, 1200);
    expect(clean.warnings).toHaveLength(0);
    expect(clean.isTooSmall).toBe(false);
    expect(clean.isNotSquare).toBe(false);

    const lowAndWide = analyzeImageDimensions(600, 1200);
    expect(lowAndWide.isTooSmall).toBe(true);
    expect(lowAndWide.isNotSquare).toBe(true);
    expect(lowAndWide.warnings).toHaveLength(2);

    expect(computeResizeDimensions(4000, 3000, 2000)).toEqual({
      width: 2000,
      height: 1500,
      resized: true
    });
    expect(computeResizeDimensions(900, 900, 2000)).toEqual({
      width: 900,
      height: 900,
      resized: false
    });
  });

  it("isolates owner-only cost_price from staff and storefront serializers", () => {
    const staffUser = { email: "staff@auroardon.co.ke", app_metadata: { role: "staff" } };
    const ownerUser = { email: "owner@auroardon.co.ke", app_metadata: { role: "owner" } };

    expect(getAdminRole(staffUser)).toBe("staff");
    expect(isOwnerUser(staffUser)).toBe(false);
    expect(isOwnerUser(ownerUser)).toBe(true);

    const stripped = stripProductCostPrice(makeProduct());
    expect("cost_price" in stripped).toBe(false);
    expect("cost_price" in (stripped.variants?.[0] ?? {})).toBe(false);
  });

  it("exports CSV with cost_price only for owners and builds accurate dry-run import diffs", () => {
    const product = makeProduct({ variants: [] });

    const ownerCsv = buildProductsCsv([product], SAMPLE_CATEGORIES, {
      includeCostPrice: true
    });
    const staffCsv = buildProductsCsv([product], SAMPLE_CATEGORIES, {
      includeCostPrice: false
    });

    expect(ownerCsv).toContain("cost_price");
    expect(ownerCsv).toContain("1900.00");
    expect(staffCsv).not.toContain("cost_price");
    expect(staffCsv).not.toContain("1900.00");

    const importCsv = [
      "slug,title,status,category_slug,price,compare_at_price,stock_quantity,material,images,image_alts,description",
      "nairobi-classic-leather-watch,Nairobi Classic Watch Updated,active,watches,4600,5200,8,Stainless steel,https://example.test/w1.webp,Watch dial front view,Updated refined watch with smooth leather strap.",
      "brand-new-cuff,Brand New Gold Cuff,draft,watches,2800,,3,Steel,https://example.test/c1.webp,Gold cuff photo,Sleek gold plated cuff designed in Nairobi.",
      "bad-row,Bad Row,active,watches,3000,2500,2,Steel,https://example.test/b1.webp,,Description long enough for validation."
    ].join("\n");

    const dryRun = buildProductImportDryRun({
      csvText: importCsv,
      existingProducts: [product],
      categories: SAMPLE_CATEGORIES,
      canEditCostPrice: true
    });

    expect(dryRun.createCount).toBe(1);
    expect(dryRun.updateCount).toBe(1);
    expect(dryRun.errorCount).toBe(1);
    expect(dryRun.stockAdjustCount).toBe(1);
    expect(dryRun.rows[0].stockDelta).toBe(3); // 5 -> 8 via ledger
    expect(dryRun.rows[2].errors.length).toBeGreaterThanOrEqual(2);
  });

  it("builds pre-filled WhatsApp back-in-stock links with variant and canonical URL", () => {
    const url = buildBackInStockWhatsAppUrl({
      phone: "254712345678",
      customer_name: "Wanjiku",
      product_id: "22222222-2222-4222-8222-222222222222",
      product_title: "Nairobi Classic Leather Watch",
      product_slug: "nairobi-classic-leather-watch",
      product_price: "4800.00",
      variant_name: "Gold / 40mm"
    });

    expect(url).toContain("https://wa.me/254712345678?text=");
    expect(url).toContain("Gold");
    expect(url).toContain("nairobi-classic-leather-watch");
  });
});

