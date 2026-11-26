"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowDownUp,
  Download,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";

import { BackInStockPanel } from "@/components/admin/back-in-stock-panel";
import { ProductCsvImportModal } from "@/components/admin/product-csv-import-modal";
import { ProductStockStatus } from "@/components/admin/product-stock-status";
import { StockIntegrityPanel } from "@/components/admin/stock-integrity-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PRODUCT_LIST_FILTERS,
  filterProducts,
  getCatalogQualityWarnings,
  resolveProductStatus,
  type ProductListFilters
} from "@/lib/admin-product-filters";
import { getSafeCatalogImageUrl } from "@/lib/catalog";
import type {
  BackInStockAlert,
  Product,
  ProductStatus,
  StoreSettings
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface ProductListProps {
  initialProducts: Product[];
  initialError?: string | null;
  restockedAlerts?: BackInStockAlert[];
  storeSettings?: Pick<StoreSettings, "site_name" | "message_templates">;
}

function getStatusBadgeClass(status: ProductStatus): string {
  if (status === "active") {
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
  }
  if (status === "archived") {
    return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
  return "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
}

function FilterFields({
  categories,
  filters,
  updateFilter
}: {
  categories: string[];
  filters: ProductListFilters;
  updateFilter: <Key extends keyof ProductListFilters>(
    key: Key,
    value: ProductListFilters[Key]
  ) => void;
}) {
  return (
    <>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Category
        </span>
        <select
          value={filters.category}
          onChange={event => updateFilter("category", event.target.value)}
          className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text outline-none transition focus:border-brass"
        >
          <option value="all">All categories</option>
          {categories.map(category => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Status
        </span>
        <select
          value={filters.active}
          onChange={event =>
            updateFilter(
              "active",
              event.target.value as ProductListFilters["active"]
            )
          }
          className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text outline-none transition focus:border-brass"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Homepage
        </span>
        <select
          value={filters.featured}
          onChange={event =>
            updateFilter(
              "featured",
              event.target.value as ProductListFilters["featured"]
            )
          }
          className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text outline-none transition focus:border-brass"
        >
          <option value="all">All products</option>
          <option value="featured">Featured</option>
          <option value="new-in">Pinned New in</option>
          <option value="not-featured">Not featured</option>
        </select>
      </label>
      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Stock
        </span>
        <select
          value={filters.stock}
          onChange={event =>
            updateFilter(
              "stock",
              event.target.value as ProductListFilters["stock"]
            )
          }
          className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text outline-none transition focus:border-brass"
        >
          <option value="all">All stock</option>
          <option value="in-stock">In stock</option>
          <option value="low-stock">Low stock (1-5)</option>
          <option value="out-of-stock">Out of stock (0)</option>
        </select>
      </label>
    </>
  );
}

export function ProductList({
  initialProducts,
  initialError = null,
  restockedAlerts = [],
  storeSettings
}: ProductListProps) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [filters, setFilters] = useState<ProductListFilters>(
    DEFAULT_PRODUCT_LIST_FILTERS
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sort, setSort] = useState("newest");
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingMutation, setPendingMutation] = useState<{
    productId: string;
    action: "updating" | "deleting";
  } | null>(null);

  // Bulk selection & actions state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<
    "status" | "price_set" | "price_adjust_percent" | "stock_adjust"
  >("status");
  const [bulkStatus, setBulkStatus] = useState<ProductStatus>("active");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  const categories = useMemo(
    () => Array.from(new Set(products.map(product => product.category))).sort(),
    [products]
  );
  const qualityWarnings = useMemo(
    () => getCatalogQualityWarnings(products),
    [products]
  );
  const filtered = useMemo(() => {
    const result = [...filterProducts(products, filters)];
    return result.sort((left, right) => {
      if (sort === "title") return left.title.localeCompare(right.title);
      if (sort === "price-low") return Number(left.price) - Number(right.price);
      if (sort === "price-high") return Number(right.price) - Number(left.price);
      if (sort === "stock-low") return left.stock_quantity - right.stock_quantity;
      if (sort === "featured-order") {
        return (
          (left.featured_order ?? 0) - (right.featured_order ?? 0) ||
          right.created_at.localeCompare(left.created_at)
        );
      }
      return (
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime()
      );
    });
  }, [products, filters, sort]);

  const activeFilterCount = [
    filters.category !== "all",
    filters.active !== "all",
    filters.featured !== "all",
    filters.stock !== "all"
  ].filter(Boolean).length;

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every(p => selectedSet.has(p.id));

  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtersOpen]);

  function updateFilter<Key extends keyof ProductListFilters>(
    key: Key,
    value: ProductListFilters[Key]
  ) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_PRODUCT_LIST_FILTERS);
  }

  function toggleSelect(productId: string) {
    setSelectedIds(current =>
      current.includes(productId)
        ? current.filter(id => id !== productId)
        : [...current, productId]
    );
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      const filteredSet = new Set(filtered.map(p => p.id));
      setSelectedIds(current => current.filter(id => !filteredSet.has(id)));
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...filtered.map(p => p.id)])));
    }
  }

  async function updateProductStatus(product: Product, nextStatus: ProductStatus) {
    setError(null);
    setNotice(null);
    setPendingMutation({ productId: product.id, action: "updating" });
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          active: nextStatus === "active"
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed");
      setProducts(current =>
        current.map(item =>
          item.id === product.id
            ? { ...item, status: nextStatus, active: nextStatus === "active" }
            : item
        )
      );
      setNotice(`"${product.title}" marked as ${nextStatus}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Unable to update ${product.title}.`
      );
    } finally {
      setPendingMutation(null);
    }
  }

  async function deleteOrArchiveProduct(product: Product) {
    if (!confirm(`Delete "${product.title}"? Products with past orders will be archived instead.`)) {
      return;
    }
    setError(null);
    setNotice(null);
    setPendingMutation({ productId: product.id, action: "deleting" });
    try {
      const response = await fetch(
        `/api/admin/products/${product.id}?archiveIfOrdered=1`,
        { method: "DELETE" }
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        archived?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Failed");
      if (payload.archived) {
        setProducts(current =>
          current.map(item =>
            item.id === product.id
              ? { ...item, status: "archived", active: false }
              : item
          )
        );
        setNotice(
          payload.message ||
            `"${product.title}" has existing orders and was archived instead of deleted.`
        );
      } else {
        setProducts(current => current.filter(item => item.id !== product.id));
        setSelectedIds(current => current.filter(id => id !== product.id));
        setNotice(`"${product.title}" deleted.`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Unable to delete ${product.title}.`
      );
    } finally {
      setPendingMutation(null);
    }
  }

  async function applyBulkEdit() {
    if (selectedIds.length === 0 || bulkBusy) return;
    setError(null);
    setNotice(null);

    let body: Record<string, unknown>;
    if (bulkAction === "status") {
      body = { action: "status", productIds: selectedIds, status: bulkStatus };
    } else if (bulkAction === "price_set") {
      const price = Number(bulkValue);
      if (!Number.isFinite(price) || price <= 0) {
        setError("Enter a valid positive price in KES.");
        return;
      }
      body = { action: "price_set", productIds: selectedIds, price };
    } else if (bulkAction === "price_adjust_percent") {
      const percent = Number(bulkValue);
      if (!Number.isFinite(percent) || percent === 0) {
        setError("Enter a non-zero percentage (e.g. 10 or -15).");
        return;
      }
      body = { action: "price_adjust_percent", productIds: selectedIds, percent };
    } else {
      const change = Number.parseInt(bulkValue, 10);
      if (!Number.isInteger(change) || change === 0) {
        setError("Enter a non-zero whole number for stock change.");
        return;
      }
      if (bulkNote.trim().length < 2) {
        setError("A stock ledger note is required for bulk stock edits.");
        return;
      }
      body = {
        action: "stock_adjust",
        productIds: selectedIds,
        change,
        note: bulkNote.trim()
      };
    }

    setBulkBusy(true);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json()) as {
        ok?: boolean;
        updatedCount?: number;
        failures?: Array<{ productId: string; error: string }>;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Bulk edit failed.");
      }

      const failNote =
        data.failures && data.failures.length > 0
          ? ` (${data.failures.length} skipped: ${data.failures[0].error})`
          : "";
      setNotice(`Bulk updated ${data.updatedCount ?? 0} product(s).${failNote}`);
      setSelectedIds([]);
      setBulkValue("");
      setBulkNote("");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Bulk edit failed."
      );
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section className="min-w-0 space-y-4 md:space-y-6">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-brass">Inventory</p>
          <h2 className="mt-1 font-serif text-[clamp(1.75rem,8vw,2.25rem)] leading-tight text-text">
            Products
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => window.location.assign("/api/admin/products/export")}
            className="text-xs sm:text-sm"
          >
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setImportOpen(true)}
            className="text-xs sm:text-sm"
          >
            <Upload className="mr-1.5 h-4 w-4" aria-hidden />
            Import CSV
          </Button>
          <Link href="/admin/products/new" className="hidden shrink-0 md:block">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Product
            </Button>
          </Link>
        </div>
      </div>

      {restockedAlerts.length > 0 && storeSettings ? (
        <BackInStockPanel
          initialAlerts={restockedAlerts}
          storeSettings={storeSettings}
          title="Restocked items — shoppers waiting on WhatsApp"
          compact
        />
      ) : null}

      <StockIntegrityPanel />

      {qualityWarnings.hasWarnings ? (
        <div
          role="region"
          aria-label="Catalog quality warnings"
          className="border border-brass/50 bg-stone p-4 text-sm text-text"
        >
          <p className="font-medium text-text">
            Catalog data warnings on active products
          </p>
          <ul className="mt-2 space-y-1.5 text-muted">
            {qualityWarnings.missingCategory.length > 0 ? (
              <li>
                <span className="font-medium text-text">
                  No category assigned ({qualityWarnings.missingCategory.length}):
                </span>{" "}
                {qualityWarnings.missingCategory.map((item, index) => (
                  <span key={item.id}>
                    {index > 0 ? ", " : ""}
                    <Link
                      href={`/admin/products/${item.id}/edit`}
                      className="text-brass underline underline-offset-2"
                    >
                      {item.title}
                    </Link>
                  </span>
                ))}
              </li>
            ) : null}
            {qualityWarnings.missingAltText.length > 0 ? (
              <li>
                <span className="font-medium text-text">
                  Missing image alt text ({qualityWarnings.missingAltText.length}):
                </span>{" "}
                {qualityWarnings.missingAltText.map((item, index) => (
                  <span key={item.id}>
                    {index > 0 ? ", " : ""}
                    <Link
                      href={`/admin/products/${item.id}/edit`}
                      className="text-brass underline underline-offset-2"
                    >
                      {item.title}
                    </Link>
                  </span>
                ))}
              </li>
            ) : null}
            {qualityWarnings.missingSecondImage.length > 0 ? (
              <li>
                <span className="font-medium text-text">
                  Missing second image ({qualityWarnings.missingSecondImage.length}):
                </span>{" "}
                {qualityWarnings.missingSecondImage.map((item, index) => (
                  <span key={item.id}>
                    {index > 0 ? ", " : ""}
                    <Link
                      href={`/admin/products/${item.id}/edit`}
                      className="text-brass underline underline-offset-2"
                    >
                      {item.title}
                    </Link>
                  </span>
                ))}
              </li>
            ) : null}
            {qualityWarnings.shortName.length > 0 ? (
              <li>
                <span className="font-medium text-text">
                  Name under 8 characters ({qualityWarnings.shortName.length}):
                </span>{" "}
                {qualityWarnings.shortName.map((item, index) => (
                  <span key={item.id}>
                    {index > 0 ? ", " : ""}
                    <Link
                      href={`/admin/products/${item.id}/edit`}
                      className="text-brass underline underline-offset-2"
                    >
                      {item.title}
                    </Link>
                  </span>
                ))}
              </li>
            ) : null}
            {qualityWarnings.missingFinishSizeInTheBox.length > 0 ? (
              <li>
                <span className="font-medium text-text">
                  Missing finish/size/in-the-box (
                  {qualityWarnings.missingFinishSizeInTheBox.length}):
                </span>{" "}
                {qualityWarnings.missingFinishSizeInTheBox.map((item, index) => (
                  <span key={item.id}>
                    {index > 0 ? ", " : ""}
                    <Link
                      href={`/admin/products/${item.id}/edit`}
                      className="text-brass underline underline-offset-2"
                    >
                      {item.title}
                    </Link>
                  </span>
                ))}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {selectedIds.length > 0 ? (
        <div className="space-y-3 border border-brass bg-stone p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">
              Bulk edit ({selectedIds.length} selected)
            </p>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-muted underline hover:text-text"
            >
              Clear selection
            </button>
          </div>
          <div className="grid gap-2.5 md:grid-cols-[200px_1fr_auto]">
            <select
              value={bulkAction}
              onChange={e =>
                setBulkAction(
                  e.target.value as
                    | "status"
                    | "price_set"
                    | "price_adjust_percent"
                    | "stock_adjust"
                )
              }
              aria-label="Bulk edit action"
              className="h-11 rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text"
            >
              <option value="status">Set status</option>
              <option value="price_set">Set exact price (KES)</option>
              <option value="price_adjust_percent">Adjust price (%)</option>
              <option value="stock_adjust">Adjust stock (ledger)</option>
            </select>

            {bulkAction === "status" ? (
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value as ProductStatus)}
                aria-label="Bulk target status"
                className="h-11 rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            ) : bulkAction === "stock_adjust" ? (
              <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
                <Input
                  type="number"
                  step={1}
                  placeholder="+5 or -2"
                  value={bulkValue}
                  onChange={e => setBulkValue(e.target.value)}
                />
                <Input
                  type="text"
                  placeholder="Required ledger note (e.g. Studio restock)"
                  value={bulkNote}
                  onChange={e => setBulkNote(e.target.value)}
                />
              </div>
            ) : (
              <Input
                type="number"
                step="0.01"
                placeholder={
                  bulkAction === "price_set"
                    ? "New price in KES (e.g. 2500)"
                    : "Percent change (e.g. 10 or -15)"
                }
                value={bulkValue}
                onChange={e => setBulkValue(e.target.value)}
              />
            )}

            <Button
              type="button"
              disabled={bulkBusy}
              onClick={() => void applyBulkEdit()}
            >
              {bulkBusy ? "Applying..." : "Apply bulk edit"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:hidden">
        <label className="relative min-w-0">
          <span className="sr-only">Search product titles</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            aria-label="Search product titles"
            placeholder="Search products"
            value={filters.search}
            onChange={event => updateFilter("search", event.target.value)}
            className="h-12 min-w-0 pl-10"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setFiltersOpen(true)}
          className="h-12 px-4"
        >
          <Filter className="mr-1.5 h-4 w-4" />
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </Button>
      </div>

      <div className="hidden items-end justify-between gap-4 lg:flex">
        <label className="relative block min-w-0">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Title / Slug
          </span>
          <Search className="absolute bottom-3 left-3 h-4 w-4 text-muted" aria-hidden />
          <Input
            aria-label="Search product titles"
            placeholder="Search titles..."
            value={filters.search}
            onChange={event => updateFilter("search", event.target.value)}
            className="w-48 pl-10"
          />
        </label>
        <div className="grid flex-1 grid-cols-5 gap-3">
          <FilterFields
            categories={categories}
            filters={filters}
            updateFilter={updateFilter}
          />
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Sort
            </span>
            <select
              value={sort}
              onChange={event => setSort(event.target.value)}
              className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text outline-none transition focus:border-brass"
            >
              <option value="newest">Newest</option>
              <option value="featured-order">Featured order</option>
              <option value="title">Title</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="stock-low">Stock: low to high</option>
            </select>
          </label>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {pendingMutation ? (
          <p className="rounded-[2px] border border-border bg-stone px-4 py-3 text-sm font-medium text-brass">
            {pendingMutation.action === "updating"
              ? "Updating product status..."
              : "Processing product action..."}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="rounded-[2px] border border-brass/50 bg-stone px-4 py-3 text-sm font-medium text-text"
          >
            {notice}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 md:hidden">
        {filtered.map(product => {
          const image = getSafeCatalogImageUrl(product.images[0]) || "/hero-jewelry.png";
          const pending = pendingMutation?.productId === product.id;
          const status = resolveProductStatus(product);
          return (
            <article
              key={product.id}
              className={`flex min-w-0 gap-3 border border-border bg-paper p-3 ${
                pending ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedSet.has(product.id)}
                  onChange={() => toggleSelect(product.id)}
                  aria-label={`Select ${product.title}`}
                  className="h-4 w-4 accent-brass"
                />
                <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-stone">
                  <Image src={image} alt="" aria-hidden="true" fill sizes="56px" className="object-cover" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-serif text-lg text-text">
                      {product.title}
                    </h3>
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-brass">
                      {product.category}
                    </p>
                  </div>
                  <Link
                    href={`/admin/products/${product.id}/edit`}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] bg-stone text-text transition hover:text-brass focus:outline-none focus:ring-2 focus:ring-brass"
                    aria-label={`Edit ${product.title}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-text">
                    {formatCurrency(product.price)}
                  </p>
                  <ProductStockStatus quantity={product.stock_quantity} />
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${getStatusBadgeClass(status)}`}
                  >
                    {status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {status !== "archived" ? (
                    <button
                      type="button"
                      onClick={() => void updateProductStatus(product, "archived")}
                      disabled={pendingMutation !== null}
                      className="inline-flex min-h-9 items-center rounded-full bg-stone px-3 text-xs font-semibold text-text hover:text-brass"
                    >
                      <Archive className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Archive
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void updateProductStatus(product, "active")}
                      disabled={pendingMutation !== null}
                      className="inline-flex min-h-9 items-center rounded-full bg-emerald-100 px-3 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                    >
                      Restore active
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void deleteOrArchiveProduct(product)}
                    disabled={pendingMutation !== null}
                    className="inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Delete
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!filtered.length ? (
          <p className="border border-dashed border-border bg-stone/50 px-4 py-12 text-center text-sm text-muted">
            No products match the current filters.
          </p>
        ) : null}
        <Link href="/admin/products/new" className="btn-primary w-full">
          <Plus className="h-4 w-4" aria-hidden />
          Add product
        </Link>
      </div>

      <div className="hidden overflow-hidden border border-border bg-paper md:block">
        <div
          className="overflow-x-auto"
          tabIndex={0}
          aria-label="Product list. Scroll horizontally to see all columns."
        >
          <table className="min-w-[840px] w-full divide-y divide-border text-sm">
            <thead className="bg-stone text-left text-xs uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Select all filtered products"
                    className="h-4 w-4 accent-brass"
                  />
                </th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-paper">
              {filtered.map(product => {
                const status = resolveProductStatus(product);
                return (
                  <tr
                    key={product.id}
                    className={
                      pendingMutation?.productId === product.id
                        ? "opacity-60"
                        : "hover:bg-stone/50"
                    }
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(product.id)}
                        onChange={() => toggleSelect(product.id)}
                        aria-label={`Select ${product.title}`}
                        className="h-4 w-4 accent-brass"
                      />
                    </td>
                    <td className="max-w-64 px-4 py-4 font-medium text-text">
                      <span className="block truncate" title={product.title}>
                        {product.title}
                      </span>
                      <span className="block truncate text-xs font-normal text-muted">
                        {product.is_featured ? `Featured #${product.featured_order ?? 0}` : ""}
                        {product.is_featured && product.is_new_in ? " · " : ""}
                        {product.is_new_in ? `New in #${product.new_in_order ?? 0}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-muted">{product.category}</td>
                    <td className="px-4 py-4 text-text">{formatCurrency(product.price)}</td>
                    <td className="px-4 py-4">
                      <ProductStockStatus quantity={product.stock_quantity} />
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={status}
                        disabled={pendingMutation !== null}
                        aria-label={`Change status for ${product.title}`}
                        onChange={e =>
                          void updateProductStatus(
                            product,
                            e.target.value as ProductStatus
                          )
                        }
                        className={`rounded-full border border-transparent px-3 py-1 text-xs font-semibold capitalize outline-none transition focus:border-brass ${getStatusBadgeClass(status)}`}
                      >
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Link href={`/admin/products/${product.id}/edit`}>
                          <Button
                            variant="ghost"
                            className="h-9 w-9 p-0"
                            aria-label={`Edit ${product.title}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="destructive"
                          className="h-9 w-9 p-0"
                          disabled={pendingMutation !== null}
                          onClick={() => void deleteOrArchiveProduct(product)}
                          aria-label={`Delete or archive ${product.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No products match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <ProductCsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          router.refresh();
        }}
      />

      {filtersOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Product filters"
          className="fixed inset-0 z-[70] md:hidden"
        >
          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            aria-label="Close product filters"
            className="absolute inset-0 bg-ink/50"
          />
          <section className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto border-t border-border bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-text">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-brass">Products</p>
                <h3 className="mt-1 font-serif text-2xl text-text">Filters</h3>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close product filters"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[2px] text-text hover:bg-stone focus:outline-none focus:ring-2 focus:ring-brass"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <FilterFields
                categories={categories}
                filters={filters}
                updateFilter={updateFilter}
              />
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-text">Sort</span>
                <div className="relative">
                  <ArrowDownUp
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                    aria-hidden
                  />
                  <select
                    value={sort}
                    onChange={event => setSort(event.target.value)}
                    className="h-12 w-full rounded-[2px] border border-text/20 bg-paper pl-10 pr-3 text-sm text-text outline-none transition focus:border-brass"
                  >
                    <option value="newest">Newest</option>
                    <option value="featured-order">Featured order</option>
                    <option value="title">Title</option>
                    <option value="price-low">Price: low to high</option>
                    <option value="price-high">Price: high to low</option>
                    <option value="stock-low">Stock: low to high</option>
                  </select>
                </div>
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={clearFilters}
                className="flex-1"
              >
                Clear filters
              </Button>
              <Button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="flex-1"
              >
                Show {filtered.length}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
