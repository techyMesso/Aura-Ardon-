"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import {
  DEFAULT_PRODUCT_BLUR_DATA_URL,
  PriceKES
} from "@/components/storefront/price-kes";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import {
  createCategoryMap,
  getCanonicalProductPath,
  getSafeCatalogImageUrl
} from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { getProductCategoryLabel } from "@/lib/product-card";

export function SearchCommandPalette() {
  const router = useRouter();
  const { categories } = useCart();
  const { catalogProducts, searchOpen, closeSearch } = useStorefrontUI();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const categoryMap = useMemo(() => createCategoryMap(categories), [categories]);

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return catalogProducts.slice(0, 8);
    }
    return catalogProducts
      .filter(product =>
        [
          product.title,
          product.description,
          product.material,
          getProductCategoryLabel(product, categoryMap)
        ]
          .filter(Boolean)
          .some(value => value!.toLowerCase().includes(trimmed))
      )
      .slice(0, 10);
  }, [catalogProducts, categoryMap, query]);

  useEffect(() => {
    if (!searchOpen) return;
    setActiveIndex(0);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!searchOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex(current =>
          results.length ? (current + 1) % results.length : 0
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(current =>
          results.length ? (current - 1 + results.length) % results.length : 0
        );
        return;
      }

      if (event.key === "Enter" && results[activeIndex]) {
        const selected = results[activeIndex];
        const path = getCanonicalProductPath(selected, categoryMap);
        if (path) {
          event.preventDefault();
          closeSearch();
          router.push(path);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, categoryMap, closeSearch, results, router, searchOpen]);

  if (!searchOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search pieces"
      className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-16 sm:pt-24"
    >
      <button
        type="button"
        aria-label="Close search"
        onClick={closeSearch}
        className="fixed inset-0 bg-ink/60"
      />

      <div className="relative z-10 w-full max-w-xl border border-text/15 bg-paper text-text">
        <div className="flex items-center gap-3 border-b border-text/12 bg-stone px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search necklaces, bracelets, rings, sets..."
            aria-label="Search catalog"
            className="w-full bg-transparent font-sans text-[14px] leading-[1.5] text-text placeholder:text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Close search"
            className="flex h-8 w-8 items-center justify-center rounded-[2px] text-muted hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="max-h-[65dvh] overflow-y-auto p-2">
          {results.length > 0 ? (
            <ul role="listbox" aria-label="Search results" className="divide-y divide-text/10">
              {results.map((product, index) => {
                const path = getCanonicalProductPath(product, categoryMap) ?? "/shop";
                const image =
                  getSafeCatalogImageUrl(product.images[0]) || "/hero-jewelry.png";
                const isSelected = index === activeIndex;

                return (
                  <li key={product.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => {
                        closeSearch();
                        router.push(path);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isSelected ? "bg-stone" : "bg-paper hover:bg-stone"
                      }`}
                    >
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-none bg-paper">
                        <Image
                          src={image}
                          alt={product.title}
                          fill
                          placeholder="blur"
                          blurDataURL={product.blur_data_url || DEFAULT_PRODUCT_BLUR_DATA_URL}
                          sizes="48px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-[14px] leading-[1.5] text-text">
                          {product.title}
                        </p>
                        <p className="truncate font-sans text-[12px] leading-[1.5] text-muted">
                          {getProductCategoryLabel(product, categoryMap)}
                        </p>
                      </div>
                      <PriceKES amount={product.price} className="shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="bg-stone px-4 py-8 text-center font-sans text-[14px] text-muted">
              Nothing matches “{query.trim()}”. Try necklaces or sets.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
