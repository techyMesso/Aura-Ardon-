import { describe, expect, it } from "vitest";

import { createCategoryMap } from "@/lib/catalog";
import {
  formatProductCardPrice,
  getProductCardAvailability,
  getProductCategoryLabel
} from "@/lib/product-card";
import type { Category, Product } from "@/lib/types";

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
