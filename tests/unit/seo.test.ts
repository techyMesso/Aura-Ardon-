import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { React: typeof React }).React = React;

import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildOrganizationJsonLd,
  buildPageMetadata,
  buildProductJsonLd,
  buildReadableSku
} from "@/lib/seo";
import { DEFAULT_SITE_URL, DEFAULT_STORE_CONFIG } from "@/lib/site";
import type { Category, Product, StoreSettings } from "@/lib/types";

const listCategoriesMock = vi.fn();
const listPublicProductsMock = vi.fn();

vi.mock("@/lib/data", () => ({
  listCategories: (...args: unknown[]) => listCategoriesMock(...args),
  listPublicProducts: (...args: unknown[]) => listPublicProductsMock(...args)
}));

const sampleCategory: Category = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Watches",
  slug: "watches",
  parent_id: null,
  description: "Classic watches in Nairobi",
  image_url: null,
  display_order: 1,
  created_at: "2026-01-01T00:00:00.000Z"
};

const emptyCategory: Category = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Accessories",
  slug: "accessories",
  parent_id: null,
  description: "Empty category",
  image_url: null,
  display_order: 2,
  created_at: "2026-01-01T00:00:00.000Z"
};

const sampleProduct: Product = {
  id: "8591e849-73c4-40d5-b0f5-39b5c980784d",
  title: "Women's Classic Leather Strap Watch",
  slug: "women-s-classic-leather-strap-watch",
  description: "Classic leather strap watch delivered in Nairobi.",
  category: "Watches",
  category_id: sampleCategory.id,
  price: "1850",
  stock_quantity: 5,
  material: "Stainless steel",
  images: ["https://scukquqkdivnodefqggf.supabase.co/storage/v1/object/public/product-images/watch.webp"],
  is_featured: true,
  active: true,
  created_at: "2026-05-01T12:00:00.000Z"
};

const sampleSettings: StoreSettings = {
  id: true,
  ...DEFAULT_STORE_CONFIG,
  instagram_url: "https://instagram.com/auroardon",
  tiktok_url: "",
  updated_at: "2026-05-01T12:00:00.000Z"
};

describe("Phase 1 SEO — robots, sitemap, metadata, JSON-LD, and accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("robots.ts uses SITE_URL and disallows all private/transactional paths", async () => {
    const prevSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const prevVercelUrl = process.env.VERCEL_URL;
    try {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      process.env.VERCEL_URL = "deployment-hash-projects.vercel.app";
      const { default: robots } = await import("@/app/robots");
      const result = robots();

      expect(result.sitemap).toBe(`${DEFAULT_SITE_URL}/sitemap.xml`);
      const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
      expect(rules?.disallow).toEqual(
        expect.arrayContaining([
          "/admin",
          "/api/",
          "/checkout",
          "/cart",
          "/order/",
          "/i/",
          "/login"
        ])
      );
    } finally {
      if (prevSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prevSiteUrl;
      if (prevVercelUrl === undefined) delete process.env.VERCEL_URL;
      else process.env.VERCEL_URL = prevVercelUrl;
    }
  });

  it("sitemap.ts uses SITE_URL, excludes empty categories, and includes active products with lastModified", async () => {
    listCategoriesMock.mockResolvedValue([sampleCategory, emptyCategory]);
    listPublicProductsMock.mockResolvedValue([sampleProduct]);

    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();
    const urls = entries.map(entry => entry.url);

    expect(urls).toContain(DEFAULT_SITE_URL);
    expect(urls).toContain(`${DEFAULT_SITE_URL}/shop`);
    expect(urls).toContain(`${DEFAULT_SITE_URL}/faq`);
    expect(urls).toContain(`${DEFAULT_SITE_URL}/shop/watches`);
    expect(urls).not.toContain(`${DEFAULT_SITE_URL}/shop/accessories`);

    const productEntry = entries.find(
      entry => entry.url === `${DEFAULT_SITE_URL}/p/${sampleProduct.slug}`
    );
    expect(productEntry?.lastModified).toBeInstanceOf(Date);
  });

  it("builds unique canonical, OG, and Twitter metadata anchored to SITE_URL", () => {
    const meta = buildPageMetadata({
      title: "Delivery",
      description: "Same-day Nairobi delivery details.",
      pathname: "/shipping"
    });

    expect(meta.alternates?.canonical).toBe(`${DEFAULT_SITE_URL}/shipping`);
    expect(meta.openGraph?.url).toBe(`${DEFAULT_SITE_URL}/shipping`);
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Delivery | Auro Ardon"
    });
  });

  it("generates a readable SKU (not a UUID) and complete Product JSON-LD without fake reviews", () => {
    const sku = buildReadableSku(sampleProduct, sampleCategory);
    expect(sku).toMatch(/^AA-WAT-/);
    expect(sku).not.toBe(sampleProduct.id);

    const jsonLd = buildProductJsonLd({
      product: sampleProduct,
      category: sampleCategory,
      productUrl: `${DEFAULT_SITE_URL}/p/${sampleProduct.slug}`
    });

    expect(jsonLd.sku).toBe(sku);
    expect(jsonLd.brand).toEqual({ "@type": "Brand", name: "Auro Ardon" });
    expect(jsonLd.offers.availability).toBe("https://schema.org/InStock");
    expect("aggregateRating" in jsonLd).toBe(false);

    const outOfStockJsonLd = buildProductJsonLd({
      product: { ...sampleProduct, stock_quantity: 0 },
      category: sampleCategory,
      productUrl: `${DEFAULT_SITE_URL}/p/${sampleProduct.slug}`
    });
    expect(outOfStockJsonLd.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("builds Organization + LocalBusiness, BreadcrumbList, and FAQPage JSON-LD cleanly", () => {
    const org = buildOrganizationJsonLd(sampleSettings);
    expect(org["@graph"]).toHaveLength(2);
    expect(org["@graph"][0]).toMatchObject({
      "@type": "Organization",
      name: "Auro Ardon",
      sameAs: ["https://instagram.com/auroardon"]
    });
    expect(org["@graph"][1]).toMatchObject({
      "@type": "LocalBusiness",
      address: expect.objectContaining({
        addressLocality: "Nairobi",
        addressCountry: "KE"
      })
    });

    const crumbs = buildBreadcrumbJsonLd([
      { name: "Home", pathname: "/" },
      { name: "Shop", pathname: "/shop" }
    ]);
    expect(crumbs.itemListElement[1]).toMatchObject({
      position: 2,
      name: "Shop",
      item: `${DEFAULT_SITE_URL}/shop`
    });

    const faq = buildFaqJsonLd([
      { question: "How do I pay?", answer: "Cash or M-Pesa on delivery." }
    ]);
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity).toHaveLength(1);
  });

  it("pluralises the navbar bag aria-label cleanly for 1 item vs 0/2 items", async () => {
    const mockUseCartValue = vi.fn();
    vi.doMock("next/navigation", () => ({
      usePathname: () => "/"
    }));
    vi.doMock("@/lib/cart", () => ({
      useCartValue: () => mockUseCartValue()
    }));
    vi.doMock("@/components/storefront/storefront-context", () => ({
      useStorefrontUI: () => ({
        openCart: vi.fn(),
        openSearch: vi.fn(),
        wishlistProducts: []
      })
    }));
    vi.doMock("@/components/theme-toggle", () => ({
      ThemeToggle: () => React.createElement("button", { type: "button" }, "Theme")
    }));
    vi.doMock("@/components/storefront/drawer", () => ({
      Drawer: () => null
    }));

    const { Navbar } = await import("@/components/storefront/navbar");

    mockUseCartValue.mockReturnValue({ itemCount: 1, items: [], total: 0 });
    const htmlOne = renderToStaticMarkup(React.createElement(Navbar, { categories: [] }));
    expect(htmlOne).toContain('aria-label="Bag with 1 item"');

    mockUseCartValue.mockReturnValue({ itemCount: 2, items: [], total: 0 });
    const htmlTwo = renderToStaticMarkup(React.createElement(Navbar, { categories: [] }));
    expect(htmlTwo).toContain('aria-label="Bag with 2 items"');

    mockUseCartValue.mockReturnValue({ itemCount: 0, items: [], total: 0 });
    const htmlZero = renderToStaticMarkup(React.createElement(Navbar, { categories: [] }));
    expect(htmlZero).toContain('aria-label="Bag with 0 items"');
  });
});

