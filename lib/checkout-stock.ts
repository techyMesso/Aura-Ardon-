export interface CheckoutStockItem {
  productId: string;
  quantity: number;
}

export interface CheckoutStockProduct {
  id: string;
  title: string;
  price: number;
  stockQuantity: number;
  active: boolean;
}

export interface CheckoutStockValidationResult {
  subtotal: number;
  itemSummary: Array<{
    productId: string;
    title: string;
    quantity: number;
    unitPrice: number;
  }>;
}

// Mirrors the transactional database rules so we can verify the stock and pricing
// behavior with fast unit tests without needing a live database.
export function validateCheckoutStock(
  products: CheckoutStockProduct[],
  items: CheckoutStockItem[]
): CheckoutStockValidationResult {
  if (items.length === 0) {
    throw new Error("Your cart is empty.");
  }

  const groupedItems = new Map<string, number>();

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Invalid quantity in cart.");
    }

    groupedItems.set(item.productId, (groupedItems.get(item.productId) ?? 0) + item.quantity);
  }

  const productById = new Map(products.map(product => [product.id, product]));
  const itemSummary: CheckoutStockValidationResult["itemSummary"] = [];
  let subtotal = 0;

  for (const [productId, quantity] of groupedItems) {
    const product = productById.get(productId);

    if (!product || !product.active) {
      throw new Error("One or more items are not available.");
    }

    if (product.stockQuantity < quantity) {
      throw new Error("One or more items are not available in the requested quantity.");
    }

    subtotal += product.price * quantity;
    itemSummary.push({
      productId,
      title: product.title,
      quantity,
      unitPrice: product.price
    });
  }

  return {
    subtotal: Number(subtotal.toFixed(2)),
    itemSummary
  };
}
