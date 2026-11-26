"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import { DEFAULT_STORE_CONFIG } from "@/lib/site";
import type { Product } from "@/lib/types";

const WISHLIST_STORAGE_KEY = "auro-ardon-wishlist";
const RECENTLY_VIEWED_STORAGE_KEY = "auro-ardon-recently-viewed";
const MAX_RECENTLY_VIEWED = 8;

export interface StorefrontPublicSettings {
  isStoreOpen: boolean;
  holidayBannerMessage: string;
  whatsappNumber: string;
  sameDayCutoff: string;
  businessHours: string;
  freeDeliveryThreshold: number;
}

const DEFAULT_PUBLIC_SETTINGS: StorefrontPublicSettings = {
  isStoreOpen: DEFAULT_STORE_CONFIG.is_store_open,
  holidayBannerMessage: DEFAULT_STORE_CONFIG.holiday_banner_message,
  whatsappNumber: DEFAULT_STORE_CONFIG.whatsapp_number,
  sameDayCutoff: DEFAULT_STORE_CONFIG.same_day_cutoff,
  businessHours: DEFAULT_STORE_CONFIG.business_hours,
  freeDeliveryThreshold: DEFAULT_STORE_CONFIG.free_delivery_threshold
};

interface StorefrontUIContextValue {
  catalogProducts: Product[];
  storeSettings: StorefrontPublicSettings;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  wishlistIds: string[];
  toggleWishlist: (productId: string) => void;
  clearWishlist: () => void;
  isWishlisted: (productId: string) => boolean;
  wishlistProducts: Product[];
  recentlyViewedIds: string[];
  recordRecentlyViewed: (productId: string) => void;
  recentlyViewedProducts: Product[];
}

const StorefrontUIContext = createContext<StorefrontUIContextValue | null>(null);

export function StorefrontUIProvider({
  products = [],
  storeSettings = DEFAULT_PUBLIC_SETTINGS,
  children
}: {
  products?: Product[];
  storeSettings?: StorefrontPublicSettings;
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

  const clearWishlist = useCallback(() => {
    setWishlistIds([]);
    try {
      localStorage.removeItem(WISHLIST_STORAGE_KEY);
    } catch {
      // Ignore storage write errors
    }
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
      storeSettings,
      cartOpen,
      openCart,
      closeCart,
      searchOpen,
      openSearch,
      closeSearch,
      wishlistIds,
      toggleWishlist,
      clearWishlist,
      isWishlisted,
      wishlistProducts,
      recentlyViewedIds,
      recordRecentlyViewed,
      recentlyViewedProducts
    }),
    [
      products,
      storeSettings,
      cartOpen,
      openCart,
      closeCart,
      searchOpen,
      openSearch,
      closeSearch,
      wishlistIds,
      toggleWishlist,
      clearWishlist,
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
  storeSettings: DEFAULT_PUBLIC_SETTINGS,
  cartOpen: false,
  openCart: () => {},
  closeCart: () => {},
  searchOpen: false,
  openSearch: () => {},
  closeSearch: () => {},
  wishlistIds: [],
  toggleWishlist: () => {},
  clearWishlist: () => {},
  isWishlisted: () => false,
  wishlistProducts: [],
  recentlyViewedIds: [],
  recordRecentlyViewed: () => {},
  recentlyViewedProducts: []
};

export function useStorefrontUI() {
  return useContext(StorefrontUIContext) ?? fallbackStorefrontUI;
}
