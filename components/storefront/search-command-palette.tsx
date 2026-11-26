"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import {
  DEFAULT_PRODUCT_BLUR_DATA_URL,
  PriceKES
} from "@/components/storefront/price-kes";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import { useCart } from "@/lib/cart";
import {
  createCategoryMap,
  formatProductTitle,
  getSafeCatalogImageUrl,
  productHref
} from "@/lib/catalog";
import { getProductCategoryLabel } from "@/lib/product-card";
import type { Product } from "@/lib/types";

export function SearchCommandPalette() {
  const router = useRouter();
  const { categories } = useCart();
  const { catalogProducts, searchOpen, closeSearch } = useStorefrontUI();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteResults, setRemoteResults] = useState<Product[] | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const categoryMap = useMemo(() => createCategoryMap(categories), [categories]);

  const placeholderText = useMemo(() => {
    const names = categories.slice(0, 3).map(category => category.name.toLowerCase());
    if (names.length > 0) {
      return `Search ${names.join(", ")}...`;
    }
    return "Search pieces, materials, or categories...";
  }, [categories]);

  const localResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return catalogProducts.slice(0, 8);
    }
    if (trimmed.length < 2) {
      return catalogProducts
        .filter(product =>
          product.title.toLowerCase().includes(trimmed)
        )
        .slice(0, 8);
    }

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    return catalogProducts
      .map(product => {
        const title = product.title.toLowerCase();
        const desc = product.description.toLowerCase();
        const mat = (product.material ?? "").toLowerCase();
        const cat = getProductCategoryLabel(product, categoryMap).toLowerCase();
        let score = 0;
        if (title.includes(trimmed)) score += 60;
        if (cat.includes(trimmed)) score += 35;
        if (mat.includes(trimmed)) score += 25;
        if (desc.includes(trimmed)) score += 15;
        for (const token of tokens) {
          if (title.includes(token)) score += 15;
          if (cat.includes(token)) score += 10;
          if (mat.includes(token)) score += 8;
          if (desc.includes(token)) score += 4;
        }
        return { product, score };
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(entry => entry.product);
  }, [catalogProducts, categoryMap, query]);

  // Fetch ranked server search suggestions after 2 characters
  useEffect(() => {
    const trimmed = query.trim();
    if (!searchOpen || trimmed.length < 2) {
      setRemoteResults(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          setRemoteResults(null);
          return;
        }
        const payload = (await response.json()) as { results?: Product[] };
        if (Array.isArray(payload.results)) {
          setRemoteResults(payload.results);
        }
      } catch {
        // Abort or network hiccup — local fallback remains active
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 150);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchOpen]);

  const results =
    query.trim().length >= 2 && remoteResults !== null
      ? remoteResults
      : localResults;

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
        const path = productHref(selected);
        event.preventDefault();
        closeSearch();
        router.push(path);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, closeSearch, results, router, searchOpen]);

  if (!searchOpen) return null;

  const suggestedProducts = catalogProducts.slice(0, 3);

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
          {searching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brass" aria-hidden />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          )}
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={placeholderText}
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
                const path = productHref(product);
                const displayTitle = formatProductTitle(product.title);
                const image =
                  getSafeCatalogImageUrl(product.images[0]) || "/hero-jewelry.png";
                const isSelected = index === activeIndex;

                return (
                  <li key={product.id} role="option" aria-selected={isSelected}>
                    <Link
                      href={path}
                      onClick={closeSearch}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isSelected ? "bg-stone" : "bg-paper hover:bg-stone"
                      }`}
                    >
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-none bg-stone">
                        <Image
                          src={image}
                          alt=""
                          aria-hidden="true"
                          fill
                          placeholder="blur"
                          blurDataURL={product.blur_data_url || DEFAULT_PRODUCT_BLUR_DATA_URL}
                          sizes="48px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-[14px] leading-[1.5] text-text">
                          {displayTitle}
                        </p>
                        <p className="truncate font-sans text-[12px] leading-[1.5] text-muted">
                          {getProductCategoryLabel(product, categoryMap)}
                        </p>
                      </div>
                      <PriceKES amount={product.price} className="shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="space-y-4 bg-stone px-4 py-6 text-center font-sans text-[14px] text-muted">
              <p className="text-text">
                Nothing matches &ldquo;{query.trim()}&rdquo;.
              </p>

              {categories.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[12px] uppercase tracking-[0.14em] text-muted">
                    Browse available categories
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {categories.slice(0, 6).map(category => (
                      <Link
                        key={category.id}
                        href={`/shop/${category.slug}`}
                        onClick={closeSearch}
                        className="rounded-[2px] border border-text/20 bg-paper px-3 py-1.5 text-[13px] text-text transition-colors hover:border-brass hover:text-brass"
                      >
                        {category.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              {suggestedProducts.length > 0 ? (
                <div className="space-y-2 border-t border-text/10 pt-4 text-left">
                  <p className="text-center text-[12px] uppercase tracking-[0.14em] text-muted">
                    Available pieces
                  </p>
                  <ul className="divide-y divide-text/10">
                    {suggestedProducts.map(product => (
                      <li key={product.id}>
                        <Link
                          href={productHref(product)}
                          onClick={closeSearch}
                          className="flex items-center justify-between gap-3 py-2 text-[13px] text-text hover:text-brass"
                        >
                          <span className="truncate">
                            {formatProductTitle(product.title)}
                          </span>
                          <PriceKES amount={product.price} className="shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
