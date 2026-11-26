"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { Category, Product, ProductVariant } from "@/lib/types";

export interface CartItem {
  product: Product;
  variant?: ProductVariant | null;
  quantity: number;
}

export function getCartItemKey(
  productId: string,
  variantId?: string | null
): string {
  return `${productId}::${variantId || "base"}`;
}

export function getCartItemUnitPrice(item: Pick<CartItem, "product" | "variant">): number {
  return Number(item.variant?.price_override ?? item.product.price) || 0;
}

export function getCartItemMaxStock(item: Pick<CartItem, "product" | "variant">): number {
  return item.variant ? item.variant.stock_quantity : item.product.stock_quantity;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, variant?: ProductVariant | null) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string | null) => void;
  clearCart: () => void;
  categories: Category[];
  cartNotice: string | null;
  dismissCartNotice: () => void;
}

interface CartValueType {
  items: CartItem[];
  itemCount: number;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const CartValueContext = createContext<CartValueType | undefined>(undefined);

const CART_STORAGE_KEY = "auro-ardon-cart";

function reconcileCartItems(
  storedItems: CartItem[],
  catalogById: Map<string, Product>
): { items: CartItem[]; adjusted: boolean } {
  let adjusted = false;
  const nextItems: CartItem[] = [];

  for (const item of storedItems) {
    if (!item?.product?.id) {
      adjusted = true;
      continue;
    }

    const freshProduct =
      catalogById.size > 0 ? catalogById.get(item.product.id) : item.product;

    if (!freshProduct || !freshProduct.active) {
      adjusted = true;
      continue;
    }

    const activeVariants = (freshProduct.variants ?? []).filter(v => v.active);

    if (item.variant?.id) {
      const freshVariant =
        catalogById.size > 0
          ? activeVariants.find(v => v.id === item.variant?.id) ?? null
          : item.variant;

      if (!freshVariant || !freshVariant.active || freshVariant.stock_quantity < 1) {
        adjusted = true;
        continue;
      }

      const requestedQty = Math.max(1, Math.floor(item.quantity || 1));
      const clampedQty = Math.min(requestedQty, freshVariant.stock_quantity);
      const oldPrice = Number(item.variant.price_override ?? item.product.price);
      const newPrice = Number(freshVariant.price_override ?? freshProduct.price);

      if (clampedQty !== requestedQty || oldPrice !== newPrice) {
        adjusted = true;
      }

      nextItems.push({
        product: freshProduct,
        variant: freshVariant,
        quantity: clampedQty
      });
      continue;
    }

    // If product now requires a variant, drop stale base-product entry
    if (activeVariants.length > 0) {
      adjusted = true;
      continue;
    }

    if (freshProduct.stock_quantity < 1) {
      adjusted = true;
      continue;
    }

    const requestedQty = Math.max(1, Math.floor(item.quantity || 1));
    const clampedQty = Math.min(requestedQty, freshProduct.stock_quantity);

    if (
      clampedQty !== requestedQty ||
      Number(freshProduct.price) !== Number(item.product.price)
    ) {
      adjusted = true;
    }

    nextItems.push({
      product: freshProduct,
      variant: null,
      quantity: clampedQty
    });
  }

  return { items: nextItems, adjusted };
}

export function CartProvider({
  children,
  categories,
  catalogProducts
}: {
  children: ReactNode;
  categories: Category[];
  catalogProducts?: Product[];
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [cartNotice, setCartNotice] = useState<string | null>(null);

  const catalogById = useMemo(
    () => new Map((catalogProducts ?? []).map(product => [product.id, product])),
    [catalogProducts]
  );

  useEffect(() => {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as CartItem[];
        if (Array.isArray(parsed)) {
          const { items: reconciled, adjusted } = reconcileCartItems(parsed, catalogById);
          setItems(reconciled);
          if (adjusted) {
            setCartNotice(
              "Some items in your bag were updated to reflect current availability or pricing."
            );
          }
        }
      } catch {
        localStorage.removeItem(CART_STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, [catalogById]);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, hydrated]);

  const addItem = useCallback(
    (product: Product, quantity = 1, variant: ProductVariant | null = null) => {
      setItems(prev => {
        const requestedQuantity = Math.max(1, Math.floor(quantity));
        const maxStock = variant ? variant.stock_quantity : product.stock_quantity;
        if (maxStock < 1) return prev;

        const targetKey = getCartItemKey(product.id, variant?.id);
        const existing = prev.find(
          item => getCartItemKey(item.product.id, item.variant?.id) === targetKey
        );
        if (existing) {
          return prev.map(item =>
            getCartItemKey(item.product.id, item.variant?.id) === targetKey
              ? {
                  product,
                  variant,
                  quantity: Math.min(item.quantity + requestedQuantity, maxStock)
                }
              : item
          );
        }
        return [
          ...prev,
          { product, variant, quantity: Math.min(requestedQuantity, maxStock) }
        ];
      });
    },
    []
  );

  const removeItem = useCallback(
    (productId: string, variantId?: string | null) => {
      const targetKey = getCartItemKey(productId, variantId);
      setItems(prev =>
        prev.filter(
          item => getCartItemKey(item.product.id, item.variant?.id) !== targetKey
        )
      );
    },
    []
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number, variantId?: string | null) => {
      if (quantity < 1) {
        removeItem(productId, variantId);
        return;
      }
      const targetKey = getCartItemKey(productId, variantId);
      setItems(prev =>
        prev.map(item => {
          if (getCartItemKey(item.product.id, item.variant?.id) !== targetKey) {
            return item;
          }
          const maxStock = getCartItemMaxStock(item);
          return {
            ...item,
            quantity: Math.min(Math.floor(quantity), maxStock)
          };
        })
      );
    },
    [removeItem]
  );

  const clearCart = useCallback(() => {
    localStorage.removeItem(CART_STORAGE_KEY);
    setItems([]);
    setCartNotice(null);
  }, []);

  const dismissCartNotice = useCallback(() => setCartNotice(null), []);

  const value = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      categories,
      cartNotice,
      dismissCartNotice
    }),
    [
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      categories,
      cartNotice,
      dismissCartNotice
    ]
  );

  const cartValue = useMemo(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = items.reduce(
      (sum, item) => sum + getCartItemUnitPrice(item) * item.quantity,
      0
    );

    return { items, itemCount, total };
  }, [items]);

  return (
    <CartContext.Provider value={value}>
      <CartValueContext.Provider value={cartValue}>
        {children}
      </CartValueContext.Provider>
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}

export function useCartValue() {
  const context = useContext(CartValueContext);
  if (!context) {
    throw new Error("useCartValue must be used within CartProvider");
  }
  return context;
}
