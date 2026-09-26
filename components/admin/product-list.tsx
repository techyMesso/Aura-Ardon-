"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Filter, Pencil, Plus, Power, Search, Trash2, X } from "lucide-react";

import { ProductStockStatus } from "@/components/admin/product-stock-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PRODUCT_LIST_FILTERS,
  filterProducts,
  type ProductListFilters
} from "@/lib/admin-product-filters";
import { getSafeCatalogImageUrl } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface ProductListProps {
  initialProducts: Product[];
  initialError?: string | null;
}

function FilterFields({
  categories,
  filters,
  updateFilter
}: {
  categories: string[];
  filters: ProductListFilters;
  updateFilter: <Key extends keyof ProductListFilters>(key: Key, value: ProductListFilters[Key]) => void;
}) {
  return (
    <>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">Category</span>
        <select value={filters.category} onChange={event => updateFilter("category", event.target.value)} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none transition focus:border-bronze focus:ring-2 focus:ring-sand">
          <option value="all">All categories</option>
          {categories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">Status</span>
        <select value={filters.active} onChange={event => updateFilter("active", event.target.value as ProductListFilters["active"])} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none transition focus:border-bronze focus:ring-2 focus:ring-sand">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">Featured</span>
        <select value={filters.featured} onChange={event => updateFilter("featured", event.target.value as ProductListFilters["featured"])} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none transition focus:border-bronze focus:ring-2 focus:ring-sand">
          <option value="all">All products</option>
          <option value="featured">Featured</option>
          <option value="not-featured">Not featured</option>
        </select>
      </label>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">Stock</span>
        <select value={filters.stock} onChange={event => updateFilter("stock", event.target.value as ProductListFilters["stock"])} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none transition focus:border-bronze focus:ring-2 focus:ring-sand">
          <option value="all">All stock</option>
          <option value="in-stock">In stock</option>
          <option value="low-stock">Low stock (1-5)</option>
          <option value="out-of-stock">Out of stock (0)</option>
        </select>
      </label>
    </>
  );
}

export function ProductList({ initialProducts, initialError = null }: ProductListProps) {
  const [products, setProducts] = useState(initialProducts);
  const [filters, setFilters] = useState<ProductListFilters>(DEFAULT_PRODUCT_LIST_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [pendingMutation, setPendingMutation] = useState<{ productId: string; action: "updating" | "deleting" } | null>(null);
  const categories = useMemo(() => Array.from(new Set(products.map(product => product.category))).sort(), [products]);
  const filtered = useMemo(() => filterProducts(products, filters), [products, filters]);
  const activeFilterCount = [filters.category !== "all", filters.active !== "all", filters.featured !== "all", filters.stock !== "all"].filter(Boolean).length;

  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtersOpen]);

  function updateFilter<Key extends keyof ProductListFilters>(key: Key, value: ProductListFilters[Key]) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_PRODUCT_LIST_FILTERS);
  }

  async function toggleActive(product: Product) {
    const newActive = !product.active;
    setError(null);
    setPendingMutation({ productId: product.id, action: "updating" });
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: newActive }) });
      if (!response.ok) throw new Error("Failed");
      setProducts(current => current.map(item => item.id === product.id ? { ...item, active: newActive } : item));
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
      setProducts(current => current.filter(item => item.id !== product.id));
    } catch {
      setError(`Unable to delete ${product.title}. Please try again.`);
    } finally {
      setPendingMutation(null);
    }
  }

  return (
    <section className="min-w-0 space-y-4 md:space-y-6">
      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="section-label">Inventory</p>
          <h2 className="mt-2 font-serif text-[clamp(1.75rem,8vw,2.25rem)] leading-tight text-ink">Products</h2>
        </div>
        <Link href="/admin/products/new" className="hidden shrink-0 md:block"><Button><Plus className="mr-2 h-4 w-4" />New Product</Button></Link>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:hidden">
        <label className="relative min-w-0">
          <span className="sr-only">Search product titles</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search product titles" placeholder="Search products" value={filters.search} onChange={event => updateFilter("search", event.target.value)} className="h-12 min-w-0 pl-10" />
        </label>
        <Button type="button" variant="secondary" onClick={() => setFiltersOpen(true)} className="h-12 px-4 tracking-[0.1em]">
          <Filter className="mr-1.5 h-4 w-4" />Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </Button>
      </div>

      <div className="hidden items-end justify-between gap-4 lg:flex">
        <label className="relative block min-w-0">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">Title</span>
          <Search className="absolute bottom-3 left-3 h-4 w-4 text-muted" aria-hidden />
          <Input aria-label="Search product titles" placeholder="Search titles..." value={filters.search} onChange={event => updateFilter("search", event.target.value)} className="w-48 pl-10" />
        </label>
        <div className="grid flex-1 grid-cols-4 gap-3"><FilterFields categories={categories} filters={filters} updateFilter={updateFilter} /></div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {pendingMutation ? <p className="rounded-xl border border-sand bg-cream px-4 py-3 text-sm font-medium text-bronze">{pendingMutation.action === "updating" ? "Updating product status..." : "Deleting product..."}</p> : null}
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p> : null}
      </div>

      <div className="space-y-3 md:hidden">
        {filtered.map(product => {
          const image = getSafeCatalogImageUrl(product.images[0]) || "/hero-jewelry.png";
          const pending = pendingMutation?.productId === product.id;
          return (
            <article key={product.id} className={`flex min-w-0 gap-3 rounded-2xl border border-white/65 bg-white/75 p-3 shadow-card ${pending ? "opacity-60" : ""}`}>
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-cream"><Image src={image} alt="" fill sizes="64px" className="object-cover" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0"><h3 className="truncate font-serif text-lg text-ink">{product.title}</h3><p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-bronze">{product.category}</p></div>
                  <Link href={`/admin/products/${product.id}/edit`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand/70 text-ink transition hover:bg-champagne focus:outline-none focus:ring-2 focus:ring-champagne" aria-label={`Edit ${product.title}`}><Pencil className="h-4 w-4" aria-hidden /></Link>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{formatCurrency(product.price)}</p><ProductStockStatus quantity={product.stock_quantity} /></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void toggleActive(product)} disabled={pendingMutation !== null} className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold transition ${product.active ? "bg-green-100 text-green-800" : "bg-sand/70 text-bronze"} disabled:cursor-not-allowed disabled:opacity-60`}><Power className="mr-1 h-3.5 w-3.5" aria-hidden />{product.active ? "Active" : "Inactive"}</button>
                  <button type="button" onClick={() => void deleteProduct(product)} disabled={pendingMutation !== null} className="inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"><Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />Delete</button>
                </div>
              </div>
            </article>
          );
        })}
        {!filtered.length ? <p className="rounded-2xl border border-dashed border-border bg-white/60 px-4 py-12 text-center text-sm text-muted">No products match the current filters.</p> : null}
        <Link href="/admin/products/new" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-bronze px-5 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-card transition hover:bg-rose"><Plus className="h-4 w-4" aria-hidden />Add Product</Link>
      </div>

      <div className="hidden overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 shadow-luxe backdrop-blur md:block">
        <div className="overflow-x-auto" tabIndex={0} aria-label="Product list. Scroll horizontally to see all columns.">
          <table className="min-w-[780px] w-full divide-y divide-border text-sm">
            <thead className="bg-sand/50 text-left uppercase tracking-[0.18em] text-muted"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Active</th><th className="px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-border bg-white/80">
              {filtered.map(product => <tr key={product.id} className={pendingMutation?.productId === product.id ? "opacity-60" : undefined}><td className="max-w-64 px-4 py-4 font-medium text-ink"><span className="block truncate" title={product.title}>{product.title}</span></td><td className="px-4 py-4 text-muted">{product.category}</td><td className="px-4 py-4 text-muted">{formatCurrency(product.price)}</td><td className="px-4 py-4"><ProductStockStatus quantity={product.stock_quantity} /></td><td className="px-4 py-4"><button onClick={() => void toggleActive(product)} disabled={pendingMutation !== null} aria-label={`${product.active ? "Deactivate" : "Activate"} ${product.title}`} className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition ${product.active ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-sand/70 text-bronze hover:bg-champagne"} disabled:cursor-not-allowed disabled:opacity-60`}><Power className="mr-1 h-3 w-3" />{product.active ? "Active" : "Inactive"}</button></td><td className="px-4 py-4"><div className="flex gap-2"><Link href={`/admin/products/${product.id}/edit`}><Button variant="ghost" className="h-8 w-8 p-0" aria-label={`Edit ${product.title}`}><Pencil className="h-4 w-4" /></Button></Link><Button variant="destructive" className="h-8 w-8 p-0" disabled={pendingMutation !== null} onClick={() => void deleteProduct(product)} aria-label={`Delete ${product.title}`}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}
              {!filtered.length ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No products match the current filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div role="dialog" aria-modal="true" aria-label="Product filters" className={`fixed inset-0 z-[70] md:hidden ${filtersOpen ? "visible" : "invisible pointer-events-none"}`}>
        <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close product filters" className={`absolute inset-0 bg-ink/45 transition-opacity ${filtersOpen ? "opacity-100" : "opacity-0"}`} />
        <section className={`absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-[2rem] bg-cream p-5 shadow-2xl transition-transform ${filtersOpen ? "translate-y-0" : "translate-y-full"}`}>
          <div className="flex items-center justify-between gap-3"><div><p className="section-label">Products</p><h3 className="mt-1 font-serif text-2xl text-ink">Filters</h3></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close product filters" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-champagne"><X className="h-5 w-5" /></button></div>
          <div className="mt-5 grid gap-4"><FilterFields categories={categories} filters={filters} updateFilter={updateFilter} /></div>
          <div className="mt-6 flex gap-3"><Button type="button" variant="ghost" onClick={clearFilters} className="flex-1">Clear filters</Button><Button type="button" onClick={() => setFiltersOpen(false)} className="flex-1">Show {filtered.length}</Button></div>
        </section>
      </div>
    </section>
  );
}
