import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Footer } from "@/components/storefront/footer";
import { PriceKES } from "@/components/storefront/price-kes";
import {
  findCatalogMisspellings,
  getCatalogQualityWarnings
} from "@/lib/admin-product-filters";
import {
  getCategoryGridClassName,
  getCategoryTileAspectClassName
} from "@/lib/catalog";
import {
  resolveProductImageAlt,
  stripBrandAltSuffix
} from "@/lib/image-processing";
import {
  formatLegalLastUpdatedDate,
  LEGAL_DRAFT_HTML_COMMENT
} from "@/lib/policies";
import { buildPageMetadata } from "@/lib/seo";
import { countUniqueProductsWithCatalogWarnings } from "@/lib/setup-checklist";
import { DEFAULT_STORE_CONFIG } from "@/lib/site";
import { HERO_CONFIG, SITE_CONFIG } from "@/lib/site-config";
import type { Category, Product, StoreSettings } from "@/lib/types";

(globalThis as unknown as { React: typeof React }).React = React;

const { mockGetStoreSettings, mockListCategories, mockListProductsByCategory } =
  vi.hoisted(() => ({
    mockGetStoreSettings: vi.fn(),
    mockListCategories: vi.fn(),
    mockListProductsByCategory: vi.fn()
  }));

vi.mock("@/lib/data", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/data")>();
  return {
    ...actual,
    getStoreSettings: mockGetStoreSettings,
    listCategories: mockListCategories,
    listProductsByCategory: mockListProductsByCategory
  };
});

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  );
}

function contrastRatio(
  rgbA: [number, number, number],
  rgbB: [number, number, number]
): number {
  const lA = relativeLuminance(...rgbA);
  const lB = relativeLuminance(...rgbB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    slug: "classic-gold-watch",
    title: "Classic Gold Watch",
    description: "Minimalist quartz timepiece.",
    price: "3200",
    compare_at_price: null,
    cost_price: "1500",
    category: "Watches",
    category_id: "cat-watches",
    material: "Stainless steel with leather straps",
    finish: "Brushed gold",
    size_label: "36mm case",
    in_the_box: "Watch and gift box",
    images: [
      "https://example.supabase.co/watch-1.webp",
      "https://example.supabase.co/watch-2.webp"
    ],
    image_alts: [
      "Classic Gold Watch dial close-up",
      "Classic Gold Watch clasp view"
    ],
    stock_quantity: 5,
    status: "active",
    active: true,
    is_featured: true,
    featured_order: 1,
    is_new_in: false,
    new_in_order: 0,
    created_at: "2026-05-01T00:00:00.000Z",
    ...overrides
  };
}

const sampleSettings: StoreSettings = {
  id: 1,
  ...DEFAULT_STORE_CONFIG,
  site_name: "Auro Ardon",
  whatsapp_number: "254745184145",
  business_phone: "254745184145",
  business_email: "orders@auroardon.co.ke",
  business_address: "Nairobi, Kenya",
  business_hours: "Mon–Sat, 9am–7pm EAT",
  same_day_cutoff: "14:00",
  legal_reviewed_at: null,
  updated_at: "2026-05-12T10:00:00.000Z"
};

describe("Round 2 Phase 4 storefront fixes", () => {
  it("removes visible draft wording from legal pages and drops HTML draft comment once legal_reviewed_at is set", async () => {
    const PrivacyPage = (await import("@/app/(storefront)/privacy/page"))
      .default;
    const TermsPage = (await import("@/app/(storefront)/terms/page")).default;

    mockGetStoreSettings.mockResolvedValueOnce(sampleSettings);
    const unreviewedPrivacy = renderToStaticMarkup(await PrivacyPage());
    expect(unreviewedPrivacy).not.toMatch(/Draft policy/i);
    expect(unreviewedPrivacy).not.toMatch(/Subject to owner legal review/i);
    expect(unreviewedPrivacy).toContain("Last updated:");
    expect(unreviewedPrivacy).toContain(LEGAL_DRAFT_HTML_COMMENT);

    const reviewedSettings: StoreSettings = {
      ...sampleSettings,
      legal_reviewed_at: "2026-06-15T09:00:00.000Z"
    };
    mockGetStoreSettings.mockResolvedValueOnce(reviewedSettings);
    const reviewedPrivacy = renderToStaticMarkup(await PrivacyPage());
    expect(reviewedPrivacy).not.toContain(LEGAL_DRAFT_HTML_COMMENT);
    expect(reviewedPrivacy).toContain(
      formatLegalLastUpdatedDate(reviewedSettings)
    );

    mockGetStoreSettings.mockResolvedValueOnce(reviewedSettings);
    const reviewedTerms = renderToStaticMarkup(await TermsPage());
    expect(reviewedTerms).not.toMatch(/Draft terms/i);
    expect(reviewedTerms).not.toMatch(/Subject to owner legal review/i);
    expect(reviewedTerms).not.toContain(LEGAL_DRAFT_HTML_COMMENT);
    expect(reviewedTerms).toContain("Last updated:");
  });

  it("emits absolute SITE_URL OpenGraph and Twitter share images on homepage and static pages while letting product pages omit defaults", () => {
    const homeMeta = buildPageMetadata({
      title: "Auro Ardon",
      description: "Curated boutique in Nairobi.",
      pathname: "/",
      absoluteTitle: true,
      siteUrl: "https://aura-ardon.vercel.app"
    });

    expect(homeMeta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: "https://aura-ardon.vercel.app/opengraph-image",
        width: 1200,
        height: 630
      })
    ]);
    expect(homeMeta.twitter?.images).toEqual([
      "https://aura-ardon.vercel.app/twitter-image"
    ]);

    const productMeta = buildPageMetadata({
      title: "Classic Gold Watch",
      description: "Minimalist quartz timepiece.",
      pathname: "/p/classic-gold-watch",
      siteUrl: "https://aura-ardon.vercel.app",
      omitDefaultImages: true
    });

    expect(productMeta.openGraph?.images).toBeUndefined();
    expect(productMeta.twitter?.images).toBeUndefined();
  });

  it("enforces WCAG AA (>= 4.5:1) contrast for --price in light and dark themes and renders 16px medium prices", () => {
    const css = readFileSync(
      path.join(process.cwd(), "app", "globals.css"),
      "utf8"
    );

    // Light :root --price = #8A6A22 (138 106 34) on #FFFFFF (255 255 255)
    expect(css).toContain("--price: 138 106 34;");
    // Dark html.dark --price = #B8923E (184 146 62) on #141114 (20 17 20)
    expect(css).toContain("--price: 184 146 62;");
    // Hero headline fluid clamp & max-width
    expect(css).toContain("clamp(2.25rem, 5vw + 1rem, 3.5rem)");
    expect(css).toContain("line-height: 1.1;");
    expect(css).toContain("max-width: 16ch;");

    expect(contrastRatio([138, 106, 34], [255, 255, 255])).toBeGreaterThanOrEqual(
      4.5
    );
    expect(contrastRatio([122, 93, 29], [239, 235, 231])).toBeGreaterThanOrEqual(
      4.5
    );
    expect(contrastRatio([184, 146, 62], [20, 17, 20])).toBeGreaterThanOrEqual(
      4.5
    );

    const priceHtml = renderToStaticMarkup(
      React.createElement(PriceKES, { amount: 2500 })
    );
    expect(priceHtml).toContain("text-price");
    expect(priceHtml).toContain("text-[16px]");
    expect(priceHtml).toContain("font-medium");
    expect(priceHtml).toContain("font-sans");

    expect(HERO_CONFIG.focalPointClass).toContain("object-[center_top]");
    expect(HERO_CONFIG.focalPointClass).toContain("md:object-[75%_center]");
  });

  it("adapts homepage category grid columns to 1, 2, 3, 4, and 5+ categories", () => {
    expect(getCategoryGridClassName(1)).toBe("grid-cols-1");
    expect(getCategoryGridClassName(2)).toBe("grid-cols-2");
    expect(getCategoryGridClassName(3)).toBe("grid-cols-3");
    expect(getCategoryGridClassName(4)).toBe("grid-cols-2 lg:grid-cols-4");
    expect(getCategoryGridClassName(5)).toBe(
      "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
    );
    expect(getCategoryGridClassName(6)).toBe(
      "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
    );
    expect(getCategoryTileAspectClassName(1)).toContain("aspect-[16/7]");
    expect(getCategoryTileAspectClassName(2)).toBe("aspect-[4/3]");
    expect(getCategoryTileAspectClassName(3)).toBe("aspect-square");
  });

  it("builds clean product alt text without brand keyword stuffing", () => {
    const productWithCustomAlts = makeProduct({
      title: "pearl drop earrings",
      image_alts: [
        "Pearl drop earrings close-up — Auro Ardon Nairobi",
        ""
      ],
      images: [
        "https://example.supabase.co/1.webp",
        "https://example.supabase.co/2.webp",
        "https://example.supabase.co/3.webp"
      ]
    });

    expect(stripBrandAltSuffix("Gold ring — Auro Ardon Nairobi")).toBe(
      "Gold ring"
    );
    expect(resolveProductImageAlt(productWithCustomAlts, 0)).toBe(
      "Pearl drop earrings close-up"
    );
    expect(resolveProductImageAlt(productWithCustomAlts, 1, 3)).toBe(
      "Pearl Drop Earrings, photo 2 of 3"
    );
    expect(resolveProductImageAlt(productWithCustomAlts, 2, 3)).toBe(
      "Pearl Drop Earrings, photo 3 of 3"
    );

    const noCustomAlt = makeProduct({
      title: "minimalist gold bangle",
      image_alts: [],
      images: ["https://example.supabase.co/bangle.webp"]
    });
    expect(resolveProductImageAlt(noCustomAlt, 0)).toBe(
      "Minimalist Gold Bangle"
    );
    expect(resolveProductImageAlt(noCustomAlt, 0)).not.toContain("Auro Ardon");
  });

  it("renders footer tagline, Cash/M-Pesa payment chips, and Instagram/TikTok icons when configured", () => {
    const category: Category = {
      id: "cat-1",
      name: "Watches",
      slug: "watches",
      parent_id: null,
      description: null,
      image_url: null,
      display_order: 1,
      created_at: "2026-01-01T00:00:00.000Z"
    };

    const html = renderToStaticMarkup(
      React.createElement(Footer, {
        categories: [category],
        storeSettings: {
          ...sampleSettings,
          instagram_url: "https://instagram.com/auroardon",
          tiktok_url: "https://tiktok.com/@auroardon"
        }
      })
    );

    expect(html).toContain(SITE_CONFIG.footerTagline.replace(/&/g, "&amp;"));
    expect(html).toContain("Cash on delivery");
    expect(html).toContain("M-Pesa on delivery");
    expect(html).toContain("Instagram");
    expect(html).toContain("TikTok");
    expect(html).not.toMatch(/safaricom/i);
    // SVG icons present for both payment chips and social links
    expect((html.match(/<svg\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("renders ProductTile names at 0.95rem (15px) and empty category state with WhatsApp notify link", async () => {
    const productTileSource = readFileSync(
      path.join(process.cwd(), "components", "storefront", "product-tile.tsx"),
      "utf8"
    );
    expect(productTileSource).toContain("text-[0.95rem]");

    const shopClientSource = readFileSync(
      path.join(
        process.cwd(),
        "components",
        "storefront",
        "shop-page-client.tsx"
      ),
      "utf8"
    );
    expect(shopClientSource).toContain("Get notified on WhatsApp when it&apos;s in");
  });

  it("sets noindex on empty category pages and keeps populated category pages indexable", async () => {
    const { generateMetadata } = await import(
      "@/app/(storefront)/shop/[category]/page"
    );
    const jewelryCategory: Category = {
      id: "cat-jewelry",
      name: "Jewelry",
      slug: "jewelry",
      parent_id: null,
      description: "Curated jewelry.",
      image_url: null,
      display_order: 1,
      created_at: "2026-01-01T00:00:00.000Z"
    };

    mockListCategories.mockResolvedValueOnce([jewelryCategory]);
    mockListProductsByCategory.mockResolvedValueOnce([]);
    const emptyMeta = await generateMetadata({
      params: Promise.resolve({ category: "jewelry" })
    });
    expect(emptyMeta.robots).toEqual({ index: false, follow: false });

    mockListCategories.mockResolvedValueOnce([jewelryCategory]);
    mockListProductsByCategory.mockResolvedValueOnce([makeProduct()]);
    const populatedMeta = await generateMetadata({
      params: Promise.resolve({ category: "jewelry" })
    });
    expect(populatedMeta.robots).toBeUndefined();
  });

  it("flags common misspellings like 'staps' in material and finish values in catalog warnings", () => {
    const typoProduct = makeProduct({
      id: "prod-typo",
      material: "Stainless with leather staps",
      finish: "Brushed gold"
    });
    const cleanProduct = makeProduct({
      id: "prod-clean",
      material: "Stainless with leather straps",
      finish: "Brushed gold"
    });

    const typoMatches = findCatalogMisspellings(typoProduct);
    expect(typoMatches).toEqual([
      { field: "material", found: "staps", suggestion: "straps" }
    ]);
    expect(findCatalogMisspellings(cleanProduct)).toEqual([]);

    const warnings = getCatalogQualityWarnings([typoProduct, cleanProduct]);
    expect(warnings.hasWarnings).toBe(true);
    expect(warnings.misspellings).toHaveLength(1);
    expect(warnings.misspellings[0].product.id).toBe("prod-typo");
    expect(countUniqueProductsWithCatalogWarnings(warnings)).toBe(1);
  });
});

