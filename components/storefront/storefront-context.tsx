"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import type { Product } from "@/lib/types";

const WISHLIST_STORAGE_KEY = "auro-ardon-wishlist";
const RECENTLY_VIEWED_STORAGE_KEY = "auro-ardon-recently-viewed";
const MAX_RECENTLY_VIEWED = 8;

interface StorefrontUIContextValue {
  catalogProducts: Product[];
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  wishlistIds: string[];
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  wishlistProducts: Product[];
  recentlyViewedIds: string[];
  recordRecentlyViewed: (productId: string) => void;
  recentlyViewedProducts: Product[];
}

const StorefrontUIContext = createContext<StorefrontUIContextValue | null>(null);

export function StorefrontUIProvider({
  products = [],
  children
}: {
  products?: Product[];
  children: React.ReactNode;
}) {
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const savedWishlist = localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (savedWishlist) {
        const parsed = JSON.parse(savedWishlist);
        if (Array.isArray(parsed)) {
          setWishlistIds(parsed.filter((item): item is string => typeof item === "string"));
        }
      }
      const savedRecent = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
      if (savedRecent) {
        const parsed = JSON.parse(savedRecent);
        if (Array.isArray(parsed)) {
          setRecentlyViewedIds(parsed.filter((item): item is string => typeof item === "string"));
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(current => !current);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlistIds(current => {
      const next = current.includes(productId)
        ? current.filter(id => id !== productId)
        : [productId, ...current];
      try {
        localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  }, []);

  const isWishlisted = useCallback(
    (productId: string) => wishlistIds.includes(productId),
    [wishlistIds]
  );

  const recordRecentlyViewed = useCallback((productId: string) => {
    setRecentlyViewedIds(current => {
      const next = [productId, ...current.filter(id => id !== productId)].slice(
        0,
        MAX_RECENTLY_VIEWED
      );
      try {
        localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  }, []);

  const productById = useMemo(
    () => new Map(products.map(product => [product.id, product])),
    [products]
  );

  const wishlistProducts = useMemo(
    () =>
      wishlistIds
        .map(id => productById.get(id))
        .filter((item): item is Product => Boolean(item)),
    [productById, wishlistIds]
  );

  const recentlyViewedProducts = useMemo(
    () =>
      recentlyViewedIds
        .map(id => productById.get(id))
        .filter((item): item is Product => Boolean(item)),
    [productById, recentlyViewedIds]
  );

  const value = useMemo<StorefrontUIContextValue>(
    () => ({
      catalogProducts: products,
      cartOpen,
      openCart,
      closeCart,
      searchOpen,
      openSearch,
      closeSearch,
      wishlistIds,
      toggleWishlist,
      isWishlisted,
      wishlistProducts,
      recentlyViewedIds,
      recordRecentlyViewed,
      recentlyViewedProducts
    }),
    [
      products,
      cartOpen,
      openCart,
      closeCart,
      searchOpen,
      openSearch,
      closeSearch,
      wishlistIds,
      toggleWishlist,
      isWishlisted,
      wishlistProducts,
      recentlyViewedIds,
      recordRecentlyViewed,
      recentlyViewedProducts
    ]
  );

  return (
    <StorefrontUIContext.Provider value={value}>
      {children}
    </StorefrontUIContext.Provider>
  );
}

const fallbackStorefrontUI: StorefrontUIContextValue = {
  catalogProducts: [],
  cartOpen: false,
  openCart: () => {},
  closeCart: () => {},
  searchOpen: false,
  openSearch: () => {},
  closeSearch: () => {},
  wishlistIds: [],
  toggleWishlist: () => {},
  isWishlisted: () => false,
  wishlistProducts: [],
  recentlyViewedIds: [],
  recordRecentlyViewed: () => {},
  recentlyViewedProducts: []
};

export function useStorefrontUI() {
  return useContext(StorefrontUIContext) ?? fallbackStorefrontUI;
}
