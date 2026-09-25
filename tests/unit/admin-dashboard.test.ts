import { describe, expect, it } from "vitest";

import { buildAdminDashboardOverview } from "@/lib/admin-dashboard";
import {
  DEFAULT_PRODUCT_LIST_FILTERS,
  filterProducts,
  getProductStockStatus
} from "@/lib/admin-product-filters";
import type { Order, Product } from "@/lib/types";

const products: Product[] = [
  {
    id: "product-1",
    title: "Plum cuff",
    slug: "plum-cuff",
    description: "A sculptural cuff for every occasion.",
    category: "Bracelets",
    category_id: null,
    price: "2500",
    stock_quantity: 5,
    material: "Gold plated steel",
    images: [],
    is_featured: true,
    active: true,
    created_at: "2026-01-02T00:00:00.000Z"
  },
  {
    id: "product-2",
    title: "Rose drop earrings",
    slug: "rose-drop-earrings",
    description: "A pair of polished drop earrings.",
    category: "Earrings",
    category_id: null,
    price: "1800",
    stock_quantity: 0,
    material: "Stainless steel",
    images: [],
    is_featured: false,
    active: false,
    created_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "product-3",
    title: "Signature chain",
    slug: "signature-chain",
    description: "A layered chain for statement styling.",
    category: "Necklaces",
    category_id: null,
    price: "3200",
    stock_quantity: 12,
    material: "Gold plated steel",
    images: [],
    is_featured: false,
    active: true,
    created_at: "2026-01-03T00:00:00.000Z"
  }
];

const orders: Order[] = [
  {
    id: "order-1",
    customer_name: "Amina",
    customer_email: null,
    customer_phone: "0712345678",
    customer_location: "Nairobi",
    notes: null,
    payment_method: "CASH_ON_DELIVERY",
    payment_status: "PENDING",
    order_status: "PENDING_CONFIRMATION",
    subtotal: "2500",
    shipping_fee: "0",
    total: "2500",
    created_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "order-2",
    customer_name: "Nia",
    customer_email: null,
    customer_phone: "0700000000",
    customer_location: "Nairobi",
    notes: null,
    payment_method: "WHATSAPP",
    payment_status: "PAID",
    order_status: "DELIVERED",
    subtotal: "3200",
    shipping_fee: "0",
    total: "3200",
    created_at: "2026-01-04T00:00:00.000Z"
  }
];

describe("admin dashboard inventory", () => {
  it("identifies low and out-of-stock products at the five-unit threshold", () => {
    const dashboard = buildAdminDashboardOverview(products, orders);

    expect(dashboard.lowStockProducts.map(product => product.id)).toEqual([
      "product-2",
      "product-1"
    ]);
    expect(getProductStockStatus(0)).toBe("out-of-stock");
    expect(getProductStockStatus(5)).toBe("low-stock");
    expect(getProductStockStatus(6)).toBe("in-stock");
  });
});

describe("admin product filters", () => {
  it("combines title, category, visibility, featured, and stock filters", () => {
    expect(
      filterProducts(products, {
        ...DEFAULT_PRODUCT_LIST_FILTERS,
        search: "cuff",
        category: "Bracelets",
        active: "active",
        featured: "featured",
        stock: "low-stock"
      }).map(product => product.id)
    ).toEqual(["product-1"]);

    expect(
      filterProducts(products, {
        ...DEFAULT_PRODUCT_LIST_FILTERS,
        stock: "out-of-stock"
      }).map(product => product.id)
    ).toEqual(["product-2"]);
  });
});
