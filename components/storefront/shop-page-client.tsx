"use client";

import { useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Gem, MessageCircle, Search, SlidersHorizontal } from "lucide-react";

import { ProductGallery } from "@/components/storefront/product-gallery";
import { createCategoryMap, resolveProductCategory } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { createWhatsAppLink } from "@/lib/utils";
import type { Product } from "@/lib/types";

const SORT_OPTIONS = ["featured", "newest", "price-asc", "price-desc"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

export function ShopPageClient({ products }: { products: Product[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { categories } = useCart();
  const initialQuery = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(initialQuery);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const requestedSort = searchParams.get("sort");
  const sort: SortOption = SORT_OPTIONS.includes(requestedSort as SortOption)
    ? (requestedSort as SortOption)
    : "featured";
  const inStock = searchParams.get("inStock") === "1";
  const categoryMap = createCategoryMap(categories);

  useEffect(() => {
    setSearch(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (search.trim() === initialQuery) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const value = search.trim();
      if (value) next.set("q", value);
      else next.delete("q");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [initialQuery, pathname, router, search, searchParams]);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function resetFilters() {
    setSearch("");
    const next = new URLSearchParams(searchParams.toString());
    next.delete("q");
    next.delete("sort");
    next.delete("inStock");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const filtered = products
    .filter(product => {
      if (inStock && product.stock_quantity < 1) return false;
      if (!deferredSearch) return true;
      const category = resolveProductCategory(product, categoryMap);
      return [product.title, product.description, product.material, category?.name]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(deferredSearch));
    })
    .sort((a, b) => {
      if (sort === "price-asc") return Number(a.price) - Number(b.price);
      if (sort === "price-desc") return Number(b.price) - Number(a.price);
      if (sort === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return Number(b.is_featured) - Number(a.is_featured)
        || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  const whatsappUrl = createWhatsAppLink(
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
    "Hello Auro Ardon, I need help finding a piece in the collection."
  );

  return (
    <div>
      <div className="sticky top-[72px] z-30 -mx-5 mb-8 border-y border-border/60 bg-[#f7efe3]/95 px-5 py-4 shadow-sm backdrop-blur md:-mx-6 md:px-6 lg:-mx-10 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-[minmax(220px,1fr)_220px_auto] md:items-center">
          <label className="relative block min-w-0">
            <span className="sr-only">Search this collection</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              placeholder="Search this collection"
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="min-h-11 w-full rounded-full border border-border bg-white/90 py-2.5 pl-11 pr-4 text-sm text-ink placeholder:text-muted/70"
            />
          </label>

          <label className="relative block min-w-0">
            <span className="sr-only">Sort products</span>
            <SlidersHorizontal className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <select
              value={sort}
              onChange={event => updateParam("sort", event.target.value)}
              className="min-h-11 w-full appearance-none rounded-full border border-border bg-white/90 py-2.5 pl-11 pr-8 text-sm text-ink"
            >
              <option value="featured">Featured</option>
              <option value="newest">Newest</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
          </label>

          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-full border border-border bg-white/90 px-4 text-sm font-medium text-ink md:justify-center">
            <input
              type="checkbox"
              checked={inStock}
              onChange={event => updateParam("inStock", event.target.checked ? "1" : null)}
              className="h-4 w-4 accent-[#8b5e34]"
            />
            In stock only
          </label>
        </div>
      </div>

      <p className="mb-6 text-sm text-muted" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "piece" : "pieces"}
        {search.trim() ? ` matching “${search.trim()}”` : ""}
      </p>

      {filtered.length ? (
        <ProductGallery products={filtered} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-bronze/30 bg-white/60 px-6 py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-champagne/15">
            <Gem className="h-7 w-7 text-bronze" aria-hidden />
          </span>
          <h2 className="mt-5 font-serif text-3xl text-ink">No pieces match just yet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted">
            Clear the filters, browse the full collection, or ask us about the next restock.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={resetFilters} className="btn-primary min-h-11">
              Reset filters
            </button>
            <Link href="/shop" className="btn-outline min-h-11">Browse all</Link>
            {whatsappUrl ? (
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-outline min-h-11">
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp us
              </a>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
