"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Power, Trash2, Plus, Search } from "lucide-react";

import { ProductStockStatus } from "@/components/admin/product-stock-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PRODUCT_LIST_FILTERS,
  filterProducts,
  type ProductListFilters
} from "@/lib/admin-product-filters";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

interface ProductListProps {
  initialProducts: Product[];
  initialError?: string | null;
}

export function ProductList({ initialProducts, initialError = null }: ProductListProps) {
  const [products, setProducts] = useState(initialProducts);
  const [filters, setFilters] = useState<ProductListFilters>(DEFAULT_PRODUCT_LIST_FILTERS);
  const [error, setError] = useState<string | null>(initialError);
  const [pendingMutation, setPendingMutation] = useState<{
    productId: string;
    action: "updating" | "deleting";
  } | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category))).sort(),
    [products]
  );
  const filtered = useMemo(() => filterProducts(products, filters), [products, filters]);

  function updateFilter<Key extends keyof ProductListFilters>(key: Key, value: ProductListFilters[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function toggleActive(product: Product) {
    const newActive = !product.active;
    setError(null);
    setPendingMutation({ productId: product.id, action: "updating" });
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive })
      });
      if (!response.ok) throw new Error("Failed");
      setProducts((current) =>
        current.map((p) => (p.id === product.id ? { ...p, active: newActive } : p))
      );
    } catch {
      setError(`Unable to update ${product.title}. Please try again.`);
    } finally {
      setPendingMutation(null);
    }
  }

  async function deleteProduct(product: Product) {
    if (!confirm("Delete this jewelry piece permanently?")) return;
    setError(null);
    setPendingMutation({ productId: product.id, action: "deleting" });
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed");
      setProducts((current) => current.filter((p) => p.id !== product.id));
    } catch {
      setError(`Unable to delete ${product.title}. Please try again.`);
    } finally {
      setPendingMutation(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="relative block sm:col-span-2 lg:col-span-1">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Title
            </span>
            <Search className="absolute bottom-3 left-3 h-4 w-4 text-muted" aria-hidden="true" />
            <Input
              aria-label="Search product titles"
              placeholder="Search titles..."
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              className="w-full pl-10 lg:w-48"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">Category</span>
            <select
              value={filters.category}
              onChange={(event) => updateFilter("category", event.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none transition focus:border-bronze focus:ring-2 focus:ring-sand"
            >
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">Status</span>
            <select value={filters.active} onChange={(event) => updateFilter("active", event.target.value as ProductListFilters["active"])} className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none transition focus:border-bronze focus:ring-2 focus:ring-sand">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">Featured</span>
            <select value={filters.featured} onChange={(event) => updateFilter("featured", event.target.value as ProductListFilters["featured"])} className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none transition focus:border-bronze focus:ring-2 focus:ring-sand">
              <option value="all">All products</option>
              <option value="featured">Featured</option>
              <option value="not-featured">Not featured</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">Stock</span>
            <select value={filters.stock} onChange={(event) => updateFilter("stock", event.target.value as ProductListFilters["stock"])} className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none transition focus:border-bronze focus:ring-2 focus:ring-sand">
              <option value="all">All stock</option>
              <option value="in-stock">In stock</option>
              <option value="low-stock">Low stock (1-5)</option>
              <option value="out-of-stock">Out of stock (0)</option>
            </select>
          </label>
        </div>
        <Link href="/admin/products/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Product
          </Button>
        </Link>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {pendingMutation ? (
          <p className="rounded-xl border border-sand bg-cream px-4 py-3 text-sm font-medium text-bronze">
            {pendingMutation.action === "updating" ? "Updating product status..." : "Deleting product..."}
          </p>
        ) : null}
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p> : null}
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 shadow-luxe backdrop-blur">
        <div className="overflow-x-auto" tabIndex={0} aria-label="Product list. Scroll horizontally to see all columns.">
          <table className="min-w-[780px] w-full divide-y divide-border text-sm">
            <thead className="bg-sand/50 text-left uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/80">
              {filtered.map((product) => (
                <tr key={product.id} className={pendingMutation?.productId === product.id ? "opacity-60" : undefined}>
                  <td className="max-w-64 px-4 py-4 font-medium text-ink"><span className="block truncate" title={product.title}>{product.title}</span></td>
                  <td className="px-4 py-4 text-muted">{product.category}</td>
                  <td className="px-4 py-4 text-muted">{formatCurrency(product.price)}</td>
                  <td className="px-4 py-4"><ProductStockStatus quantity={product.stock_quantity} /></td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => void toggleActive(product)}
                      disabled={pendingMutation !== null}
                      aria-label={`${product.active ? "Deactivate" : "Activate"} ${product.title}`}
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition ${
                         product.active
                          ? "bg-green-100 text-green-800 hover:bg-green-200"
                          : "bg-sand/70 text-bronze hover:bg-champagne"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <Power className="mr-1 h-3 w-3" />
                      {product.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <Link href={`/admin/products/${product.id}/edit`}>
                        <Button variant="ghost" className="h-8 w-8 p-0" aria-label={`Edit ${product.title}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="destructive"
                        className="h-8 w-8 p-0"
                        disabled={pendingMutation !== null}
                        onClick={() => void deleteProduct(product)}
                        aria-label={`Delete ${product.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No products match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
