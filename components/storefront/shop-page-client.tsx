"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";

import { ProductGallery } from "@/components/storefront/product-gallery";
import type { Product } from "@/lib/types";

interface ShopPageClientProps {
  products: Product[];
}

export function ShopPageClient({ products }: ShopPageClientProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, search]);

  return (
    <div>
      <div className="mb-8">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[2rem] border border-border bg-white/70 px-12 py-3 text-ink focus:outline-none focus:ring-2 focus:ring-bronze/50"
          />
        </div>
      </div>
      <p className="mb-6 text-sm text-muted">
        Showing {filtered.length} {filtered.length === 1 ? "piece" : "pieces"}
        {search && ` for "${search}"`}
      </p>
      <ProductGallery products={filtered} />
    </div>
  );
}
