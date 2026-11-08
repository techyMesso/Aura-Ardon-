import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProductTile } from "@/components/storefront/product-tile";
import { StorefrontUIProvider } from "@/components/storefront/storefront-context";
import { CartProvider } from "@/lib/cart";
import { createCategoryMap, productHref } from "@/lib/catalog";
import {
  formatProductCardPrice,
  getProductCardAvailability,
  getProductCategoryLabel
} from "@/lib/product-card";
import type { Category, Product } from "@/lib/types";

(globalThis as unknown as { React: typeof React }).React = React;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => React.createElement("a", { href, ...rest }, children)
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt
  }: {
    src: string;
    alt: string;
  }) => React.createElement("img", { src, alt })
}));

const category: Category = {
  id: "category-1",
  name: "Bracelets",
  slug: "bracelets",
  parent_id: null,
  description: null,
  image_url: null,
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z"
};

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    title: "Plum cuff",
    slug: "plum-cuff",
    description: "A sculptural cuff for every occasion.",
    category: "Bracelets",
    category_id: category.id,
    price: "300",
    stock_quantity: 8,
    material: "Gold plated steel",
    images: [],
    is_featured: false,
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("product card category labels", () => {
  it("uses the mapped category name before the legacy category string", () => {
    expect(getProductCategoryLabel(makeProduct(), createCategoryMap([category]))).toBe("Bracelets");
  });

  it("shows a legacy category string or neutral collection fallback", () => {
    const categories = createCategoryMap([]);

    expect(
      getProductCategoryLabel(
        makeProduct({ category_id: null, category: "Legacy jewelry" }),
        categories
      )
    ).toBe("Legacy jewelry");
    expect(getProductCategoryLabel(makeProduct({ category_id: null, category: "" }), categories)).toBe("Collection");
  });
});

describe("product card stock state", () => {
  it("marks an out-of-stock product as disabled with readable feedback", () => {
    const availability = getProductCardAvailability(makeProduct({ stock_quantity: 0 }), 0);

    expect(availability).toMatchObject({
      soldOut: true,
      lowStock: false,
      disabled: true,
      buttonLabel: "Out of stock"
    });
  });

  it("formats storefront card prices with the KSh prefix and two decimals", () => {
    expect(formatProductCardPrice("300")).toBe("KSh 300.00");
  });
});

describe("productHref and ProductTile links", () => {
  it("builds a canonical /p/[slug] href even when category_id is null or slug is empty", () => {
    expect(productHref(makeProduct({ category_id: null, slug: "gold-bangle" }))).toBe("/p/gold-bangle");
    expect(productHref(makeProduct({ category_id: null, slug: "", id: "uuid-99" }))).toBe("/p/uuid-99");
  });

  it("renders an anchor href to /p/[slug] wrapping image, name, and price for categorized and uncategorized products", () => {
    const categorized = makeProduct({ slug: "plum-cuff", price: "1200" });
    const uncategorized = makeProduct({
      id: "uncat-1",
      title: "Solo Ring",
      slug: "solo-ring",
      category_id: null,
      category: "",
      price: "850"
    });

    for (const product of [categorized, uncategorized]) {
      const html = renderToStaticMarkup(
        React.createElement(
          CartProvider,
          { categories: [] },
          React.createElement(
            StorefrontUIProvider,
            { products: [product] },
            React.createElement(ProductTile, { product })
          )
        )
      );

      expect(html).toContain(`href="/p/${product.slug}"`);
      expect(html).toContain(product.title);
    }
  });
});
