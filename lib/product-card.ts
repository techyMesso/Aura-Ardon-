import { resolveProductCategory, type CategoryMap } from "@/lib/catalog";
import type { Product } from "@/lib/types";

export const PRODUCT_CARD_LOW_STOCK_THRESHOLD = 5;

export function getProductCategoryLabel(product: Product, categories: CategoryMap) {
  return resolveProductCategory(product, categories)?.name
    || product.category.trim()
    || "Collection";
}

export function getProductCardAvailability(product: Product, cartQuantity: number) {
  const remaining = Math.max(0, product.stock_quantity - cartQuantity);
  const soldOut = product.stock_quantity <= 0;

  return {
    soldOut,
    lowStock: !soldOut && product.stock_quantity <= PRODUCT_CARD_LOW_STOCK_THRESHOLD,
    limitReached: !soldOut && remaining < 1,
    disabled: remaining < 1,
    buttonLabel: soldOut
      ? "Out of stock"
      : remaining < 1
        ? "Cart limit reached"
        : "Add to cart"
  };
}

export function formatProductCardPrice(value: string | number) {
  const amount = Number(value);
  return `KSh ${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}
