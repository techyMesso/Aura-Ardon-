"use client";

import { useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Gem, MessageCircle, Search, SlidersHorizontal, X } from "lucide-react";

import { ProductGallery } from "@/components/storefront/product-gallery";
import { createCategoryMap } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { getProductCategoryLabel } from "@/lib/product-card";
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

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
      return [product.title, product.description, product.material, getProductCategoryLabel(product, categoryMap)]
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
      <div className="sticky top-[72px] z-30 -mx-5 mb-6 border-y border-border/60 bg-cream/95 px-5 py-3 shadow-sm backdrop-blur md:-mx-6 md:mb-8 md:px-6 md:py-4 lg:-mx-10 lg:px-10">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:hidden">
          <label className="relative block min-w-0">
            <span className="sr-only">Search this collection</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              placeholder="Search this collection"
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="min-h-12 w-full rounded-full border border-border bg-white/90 py-2.5 pl-11 pr-4 text-sm text-ink placeholder:text-muted/70"
            />
          </label>
          <button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-border bg-white px-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink transition hover:border-bronze focus:outline-none focus:ring-2 focus:ring-champagne" aria-label="Open filter and sort options">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filter & Sort
          </button>
        </div>

        <div className="mx-auto hidden max-w-7xl gap-3 md:grid md:grid-cols-[minmax(220px,1fr)_220px_auto] md:items-center">
          <label className="relative block min-w-0">
            <span className="sr-only">Search this collection</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" placeholder="Search this collection" value={search} onChange={event => setSearch(event.target.value)} className="min-h-11 w-full rounded-full border border-border bg-white/90 py-2.5 pl-11 pr-4 text-sm text-ink placeholder:text-muted/70" />
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
              className="h-4 w-4 accent-bronze"
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

      <div role="dialog" aria-modal="true" aria-label="Filter and sort products" className={`fixed inset-0 z-[80] md:hidden ${filtersOpen ? "visible" : "invisible pointer-events-none"}`}>
        <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filter and sort options" className={`absolute inset-0 bg-ink/45 transition-opacity ${filtersOpen ? "opacity-100" : "opacity-0"}`} />
        <section className={`absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-[2rem] bg-cream p-5 shadow-2xl transition-transform ${filtersOpen ? "translate-y-0" : "translate-y-full"}`}>
          <div className="flex items-center justify-between gap-3"><div><p className="section-label">Collection</p><h2 className="mt-1 font-serif text-2xl text-ink">Filter & sort</h2></div><button type="button" onClick={() => setFiltersOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-white focus:outline-none focus:ring-2 focus:ring-bronze" aria-label="Close filter and sort options"><X className="h-5 w-5" aria-hidden /></button></div>
          <label className="mt-6 block"><span className="mb-2 block text-sm font-semibold text-ink">Sort by</span><select value={sort} onChange={event => updateParam("sort", event.target.value)} className="min-h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm text-ink"><option value="featured">Featured</option><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label>
          <label className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-white px-4 text-sm font-semibold text-ink"><input type="checkbox" checked={inStock} onChange={event => updateParam("inStock", event.target.checked ? "1" : null)} className="h-5 w-5 accent-bronze" />In stock only</label>
          <div className="mt-6 flex gap-3"><button type="button" onClick={resetFilters} className="btn-outline min-h-12 flex-1 px-3 text-xs">Clear</button><button type="button" onClick={() => setFiltersOpen(false)} className="btn-primary min-h-12 flex-1 px-3 text-xs">Show {filtered.length}</button></div>
        </section>
      </div>
    </div>
  );
}
