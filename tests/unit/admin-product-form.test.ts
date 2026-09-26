import { describe, expect, it } from "vitest";

import {
  getCategoryFormMessage,
  getInitialProductCategoryId,
  getProductFormCategories
} from "@/lib/admin-product-form";
import type { Category, Product } from "@/lib/types";

const categories: Category[] = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Rings",
    slug: "rings",
    parent_id: null,
    description: null,
    image_url: null,
    display_order: 2,
    created_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Bracelets",
    slug: "bracelets",
    parent_id: null,
    description: null,
    image_url: null,
    display_order: 1,
    created_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Anklets",
    slug: "anklets",
    parent_id: null,
    description: null,
    image_url: null,
    display_order: 1,
    created_at: "2026-01-01T00:00:00.000Z"
  }
];

const legacyProduct: Product = {
  id: "product-1",
  title: "Legacy bracelet",
  slug: "legacy-bracelet",
  description: "A legacy product with a category display name.",
  category: "Bracelets",
  category_id: null,
  price: "3000.00",
  stock_quantity: 2,
  material: "Gold plated steel",
  images: ["https://example.test/bracelet.jpg"],
  is_featured: false,
  active: true,
  created_at: "2026-01-01T00:00:00.000Z"
};

describe("admin product category selection", () => {
  it("loads categories in display order then alphabetical name for the dropdown", () => {
    expect(getProductFormCategories(categories).map(category => category.name)).toEqual([
      "Anklets",
      "Bracelets",
      "Rings"
    ]);
  });

  it("preselects a matching category for legacy products", () => {
    expect(getInitialProductCategoryId(legacyProduct, categories)).toBe(categories[1].id);
  });

  it("reports the create-category empty state when no options are available", () => {
    expect(getCategoryFormMessage([])).toBe("Create a category before adding a product");
  });
});
