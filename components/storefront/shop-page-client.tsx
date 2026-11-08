"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import { Drawer } from "@/components/storefront/drawer";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { useCart } from "@/lib/cart";
import type { Product } from "@/lib/types";

const SORT_OPTIONS = ["newest", "price-asc", "price-desc"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const PRICE_RANGES = [
  { id: "all", label: "All prices", min: 0, max: Number.POSITIVE_INFINITY },
  { id: "under-1500", label: "Under KES 1,500", min: 0, max: 1500 },
  { id: "1500-3000", label: "KES 1,500 – 3,000", min: 1500, max: 3000 },
  { id: "over-3000", label: "Over KES 3,000", min: 3000, max: Number.POSITIVE_INFINITY }
] as const;

export function ShopPageClient({ products }: { products: Product[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { categories } = useCart();

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [priceRangeId, setPriceRangeId] = useState<string>("all");
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all");

  const requestedSort = searchParams.get("sort");
  const sort: SortOption = SORT_OPTIONS.includes(requestedSort as SortOption)
    ? (requestedSort as SortOption)
    : "newest";
  const inStock = searchParams.get("inStock") === "1";
  const queryText = (searchParams.get("q") ?? "").trim().toLowerCase();

  const availableMaterials = useMemo(() => {
    const set = new Set<string>();
    for (const product of products) {
      if (product.material?.trim()) {
        set.add(product.material.trim());
      }
    }
    return Array.from(set);
  }, [products]);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearFilters() {
    setPriceRangeId("all");
    setSelectedMaterial("all");
    const next = new URLSearchParams(searchParams.toString());
    next.delete("inStock");
    next.delete("q");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const activePriceRange =
    PRICE_RANGES.find(range => range.id === priceRangeId) ?? PRICE_RANGES[0];

  const filtered = useMemo(() => {
    return products
      .filter(product => {
        if (inStock && product.stock_quantity < 1) return false;
        const numericPrice = Number(product.price);
        if (
          numericPrice < activePriceRange.min ||
          numericPrice > activePriceRange.max
        ) {
          return false;
        }
        if (
          selectedMaterial !== "all" &&
          (product.material?.trim().toLowerCase() ?? "") !==
            selectedMaterial.toLowerCase()
        ) {
          return false;
        }
        if (queryText) {
          return [product.title, product.description, product.material]
            .filter(Boolean)
            .some(value => value!.toLowerCase().includes(queryText));
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === "price-asc") return Number(a.price) - Number(b.price);
        if (sort === "price-desc") return Number(b.price) - Number(a.price);
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
  }, [activePriceRange, inStock, products, queryText, selectedMaterial, sort]);

  const necklacesHref =
    categories.find(cat => cat.slug.includes("necklace"))
      ? `/shop/${categories.find(cat => cat.slug.includes("necklace"))!.slug}`
      : "/shop";
  const setsHref =
    categories.find(cat => cat.slug.includes("set"))
      ? `/shop/${categories.find(cat => cat.slug.includes("set"))!.slug}`
      : "/shop";

  const filterControls = (
    <div className="space-y-7 font-sans text-[14px] leading-[1.5]">
      <div>
        <h2 className="font-medium text-text">Category</h2>
        <ul className="mt-2.5 space-y-1.5">
          <li>
            <Link
              href="/shop"
              className={`block ${
                pathname === "/shop"
                  ? "text-brass"
                  : "text-muted hover:text-text"
              }`}
            >
              All pieces
            </Link>
          </li>
          {categories.map(category => {
            const href = `/shop/${category.slug}`;
            const active = pathname === href;
            return (
              <li key={category.id}>
                <Link
                  href={href}
                  className={`block ${
                    active ? "text-brass" : "text-muted hover:text-text"
                  }`}
                >
                  {category.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h2 className="font-medium text-text">Price (KES)</h2>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {PRICE_RANGES.map(range => {
            const active = priceRangeId === range.id;
            return (
              <button
                key={range.id}
                type="button"
                onClick={() => setPriceRangeId(range.id)}
                className={`cursor-pointer rounded-[2px] px-2.5 py-1 text-[13px] transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : "bg-stone text-text hover:text-brass"
                }`}
              >
                {range.label}
              </button>
            );
          })}
        </div>
      </div>

      {availableMaterials.length > 0 ? (
        <div>
          <h2 className="font-medium text-text">Material & finish</h2>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedMaterial("all")}
              className={`cursor-pointer rounded-[2px] px-2.5 py-1 text-[13px] transition-colors ${
                selectedMaterial === "all"
                  ? "bg-ink text-white"
                  : "bg-stone text-text hover:text-brass"
              }`}
            >
              All finishes
            </button>
            {availableMaterials.map(material => {
              const active = selectedMaterial === material;
              return (
                <button
                  key={material}
                  type="button"
                  onClick={() => setSelectedMaterial(material)}
                  className={`cursor-pointer rounded-[2px] px-2.5 py-1 text-[13px] transition-colors ${
                    active
                      ? "bg-ink text-white"
                      : "bg-stone text-text hover:text-brass"
                  }`}
                >
                  {material}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-text">
          <input
            type="checkbox"
            checked={inStock}
            onChange={event =>
              updateParam("inStock", event.target.checked ? "1" : null)
            }
            className="h-4 w-4 accent-brass"
          />
          <span>In stock only</span>
        </label>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="font-sans text-[14px] leading-[1.5] text-muted" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "piece" : "pieces"}
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[2px] bg-stone px-3.5 py-1.5 font-sans text-[14px] text-text lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span>Filter</span>
          </button>

          <label className="inline-flex items-center gap-2 font-sans text-[14px] text-muted">
            <span>Sort</span>
            <select
              value={sort}
              onChange={event => updateParam("sort", event.target.value)}
              aria-label="Sort products"
              className="h-10 rounded-[2px] border border-text/20 bg-paper px-3 font-sans text-[14px] text-text focus:border-brass focus:outline-none"
            >
              <option value="newest">New in</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Product filters">
          {filterControls}
        </aside>

        <div>
          {filtered.length > 0 ? (
            <ProductGallery products={filtered} priorityCount={4} columns={4} />
          ) : (
            <div className="bg-stone p-8 font-sans text-[16px] leading-[1.5] text-text">
              <p>
                Nothing here yet — try{" "}
                <Link
                  href={necklacesHref}
                  onClick={clearFilters}
                  className="text-brass underline underline-offset-4"
                >
                  Necklaces
                </Link>{" "}
                or{" "}
                <Link
                  href={setsHref}
                  onClick={clearFilters}
                  className="text-brass underline underline-offset-4"
                >
                  Sets
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>

      <Drawer
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        title="Filter pieces"
        side="bottom"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearFilters}
              className="btn-outline flex-1"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="btn-primary flex-1"
            >
              Show {filtered.length}
            </button>
          </div>
        }
      >
        {filterControls}
      </Drawer>
    </div>
  );
}
