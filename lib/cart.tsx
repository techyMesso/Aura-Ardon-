"use client";

import { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import type { Product } from "@/lib/types";

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

interface CartValueType {
  items: CartItem[];
  itemCount: number;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const CartValueContext = createContext<CartValueType | undefined>(undefined);

const CART_STORAGE_KEY = "auro-ardon-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        localStorage.removeItem(CART_STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, hydrated]);

  const addItem = useCallback((product: Product, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity < 1) {
      removeItem(productId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  }, [removeItem]);

  const clearCart = useCallback(() => setItems([]), []);

  // Memoize derived values to prevent unnecessary re-renders
  const value = useMemo(() => ({
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart
  }), [items, addItem, removeItem, updateQuantity, clearCart]);

  const cartValue = useMemo(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = items.reduce((sum, item) => {
      const price = Number(item.product.price) || 0;
      return sum + price * item.quantity;
    }, 0);
    
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