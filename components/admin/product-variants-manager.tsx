"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Layers,
  Pencil,
  Plus,
  Power,
  Trash2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compressImageToWebp } from "@/lib/image-processing";
import type { ProductVariant } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface ProductVariantsManagerProps {
  productId: string;
  basePrice: string;
  initialVariants: ProductVariant[];
  canManageCostPrice: boolean;
  onStockChanged?: (newProductStock: number) => void;
}

export function ProductVariantsManager({
  productId,
  basePrice,
  initialVariants,
  canManageCostPrice,
  onStockChanged
}: ProductVariantsManagerProps) {
  const [variants, setVariants] = useState<ProductVariant[]>(initialVariants);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [colour, setColour] = useState("");
  const [size, setSize] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [initialStock, setInitialStock] = useState("0");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [active, setActive] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Per-variant stock ledger adjustment state
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);

  function resetForm() {
    setEditingId(null);
    setName("");
    setSku("");
    setColour("");
    setSize("");
    setPriceOverride("");
    setCostPrice("");
    setInitialStock("0");
    setImageUrl("");
    setImageAlt("");
    setSortOrder(String(variants.length));
    setActive(true);
    setError(null);
  }

  function startEdit(variant: ProductVariant) {
    setEditingId(variant.id);
    setName(variant.name);
    setSku(variant.sku);
    setColour(variant.option_values?.colour ?? "");
    setSize(variant.option_values?.size ?? "");
    setPriceOverride(variant.price_override ?? "");
    setCostPrice(canManageCostPrice ? (variant.cost_price ?? "") : "");
    setInitialStock(String(variant.stock_quantity));
    setImageUrl(variant.image_url ?? "");
    setImageAlt(variant.image_alt ?? "");
    setSortOrder(String(variant.sort_order ?? 0));
    setActive(variant.active);
    setError(null);
    setNotice(null);
  }

  async function handleVariantImageUpload(file: File) {
    setUploadingImage(true);
    setError(null);
    try {
      const compressed = await compressImageToWebp(file, 2000, 0.85);
      const formData = new FormData();
      formData.append("files", compressed.file);
      const res = await fetch("/api/admin/storage/upload", {
        method: "POST",
        body: formData
      });
      const data = (await res.json()) as { urls?: string[]; error?: string };
      if (!res.ok || !data.urls?.[0]) {
        throw new Error(data.error ?? "Upload failed.");
      }
      setImageUrl(data.urls[0]);
      if (!imageAlt.trim() && name.trim()) {
        setImageAlt(name.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSaveVariant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setNotice(null);

    if (imageUrl.trim() && !imageAlt.trim()) {
      setError("Alt text is required when a variant image is set.");
      return;
    }

    const optionValues: Record<string, string> = {};
    if (colour.trim()) optionValues.colour = colour.trim();
    if (size.trim()) optionValues.size = size.trim();

    const payload: Record<string, unknown> = {
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      option_values: optionValues,
      price_override: priceOverride.trim() ? Number(priceOverride) : null,
      image_url: imageUrl.trim() || null,
      image_alt: imageUrl.trim() ? imageAlt.trim() : null,
      sort_order: Math.max(0, Math.floor(Number(sortOrder) || 0)),
      active
    };

    if (canManageCostPrice) {
      payload.cost_price = costPrice.trim() ? Number(costPrice) : null;
    }
    if (!editingId) {
      payload.stock_quantity = Math.max(0, Math.floor(Number(initialStock) || 0));
    }

    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/products/${productId}/variants/${editingId}`
        : `/api/admin/products/${productId}/variants`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as {
        variant?: ProductVariant;
        error?: string;
      };
      if (!res.ok || !data.variant) {
        throw new Error(data.error ?? "Unable to save variant.");
      }

      const saved = data.variant;
      let nextList: ProductVariant[];
      if (editingId) {
        nextList = variants.map(v => (v.id === editingId ? saved : v));
      } else {
        nextList = [...variants, saved];
      }
      nextList.sort((a, b) => a.sort_order - b.sort_order);
      setVariants(nextList);

      const activeTotal = nextList
        .filter(v => v.active)
        .reduce((sum, v) => sum + v.stock_quantity, 0);
      onStockChanged?.(activeTotal);

      setNotice(editingId ? `Updated variant "${saved.name}".` : `Added variant "${saved.name}".`);
      resetForm();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to save variant."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(variant: ProductVariant) {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/admin/products/${productId}/variants/${variant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !variant.active })
        }
      );
      const data = (await res.json()) as { variant?: ProductVariant; error?: string };
      if (!res.ok || !data.variant) {
        throw new Error(data.error ?? "Unable to update variant.");
      }
      const nextList = variants.map(v => (v.id === variant.id ? data.variant! : v));
      setVariants(nextList);
      onStockChanged?.(
        nextList.filter(v => v.active).reduce((sum, v) => sum + v.stock_quantity, 0)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update variant.");
    }
  }

  async function handleDeleteVariant(variant: ProductVariant) {
    if (!confirm(`Remove variant "${variant.name}"?`)) return;
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/admin/products/${productId}/variants/${variant.id}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to remove variant.");
      }
      const nextList = variants.filter(v => v.id !== variant.id);
      setVariants(nextList);
      onStockChanged?.(
        nextList.filter(v => v.active).reduce((sum, v) => sum + v.stock_quantity, 0)
      );
      if (editingId === variant.id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove variant.");
    }
  }

  async function handleAdjustVariantStock(variant: ProductVariant) {
    const parsedDelta = Number.parseInt(adjustDelta, 10);
    if (!Number.isInteger(parsedDelta) || parsedDelta === 0) {
      setError("Enter a non-zero whole number for the stock adjustment.");
      return;
    }
    if (adjustNote.trim().length < 2) {
      setError("A note explaining this variant stock adjustment is required.");
      return;
    }

    setAdjustBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/admin/products/${productId}/variants/${variant.id}/stock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            change: parsedDelta,
            note: adjustNote.trim(),
            type: "manual_adjustment"
          })
        }
      );
      const data = (await res.json()) as {
        newVariantStock?: number;
        newProductStock?: number;
        waitingAlerts?: unknown[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to adjust variant stock.");
      }

      setVariants(current =>
        current.map(v =>
          v.id === variant.id
            ? { ...v, stock_quantity: data.newVariantStock ?? v.stock_quantity + parsedDelta }
            : v
        )
      );
      if (typeof data.newProductStock === "number") {
        onStockChanged?.(data.newProductStock);
      }

      const waitCount = Array.isArray(data.waitingAlerts) ? data.waitingAlerts.length : 0;
      setNotice(
        `Adjusted "${variant.name}" stock by ${parsedDelta > 0 ? `+${parsedDelta}` : parsedDelta} (now ${data.newVariantStock}).` +
          (waitCount > 0
            ? ` ${waitCount} waiting customer${waitCount === 1 ? "" : "s"} can now be notified in the waitlist below!`
            : "")
      );
      setAdjustingId(null);
      setAdjustDelta("");
      setAdjustNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to adjust variant stock.");
    } finally {
      setAdjustBusy(false);
    }
  }

  return (
    <section
      className="mt-8 space-y-6 border border-border bg-paper p-4 sm:p-6"
      aria-labelledby="product-variants-heading"
    >
      <div>
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brass" aria-hidden />
          <p className="text-sm font-medium text-brass">Optional variants</p>
        </div>
        <h3 id="product-variants-heading" className="mt-1 font-serif text-2xl text-text">
          Colours, sizes &amp; variant SKUs ({variants.length})
        </h3>
        <p className="mt-1 text-sm text-muted">
          Add variants when a piece comes in multiple options. Each variant tracks its own SKU, optional price override, image, and ledger stock.
        </p>
      </div>

      {variants.length > 0 ? (
        <div className="space-y-3">
          {variants.map(variant => (
            <div
              key={variant.id}
              className="rounded-[2px] border border-border bg-stone/35 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {variant.image_url ? (
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden bg-paper border border-border">
                      <Image
                        src={variant.image_url}
                        alt={variant.image_alt || variant.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-semibold text-text">
                      {variant.name}{" "}
                      <span className="font-mono text-xs font-normal text-muted">
                        ({variant.sku})
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Price:{" "}
                      <strong className="text-text">
                        {formatCurrency(variant.price_override ?? basePrice)}
                      </strong>
                      {variant.price_override ? " (override)" : " (base)"}
                      {canManageCostPrice && variant.cost_price != null
                        ? ` · Cost: ${formatCurrency(variant.cost_price)}`
                        : ""}
                      {" · "}
                      Stock:{" "}
                      <strong
                        className={
                          variant.stock_quantity < 1
                            ? "text-red-600 dark:text-red-400"
                            : "text-text"
                        }
                      >
                        {variant.stock_quantity}
                      </strong>
                      {" · "}
                      {variant.active ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setAdjustingId(adjustingId === variant.id ? null : variant.id);
                      setAdjustDelta("");
                      setAdjustNote("");
                    }}
                    className="min-h-9 px-3 text-xs"
                  >
                    Adjust stock
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => startEdit(variant)}
                    className="min-h-9 px-2.5 text-xs"
                    aria-label={`Edit ${variant.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void handleToggleActive(variant)}
                    className="min-h-9 px-2.5 text-xs"
                    aria-label={`${variant.active ? "Deactivate" : "Activate"} ${variant.name}`}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void handleDeleteVariant(variant)}
                    className="min-h-9 px-2.5 text-xs"
                    aria-label={`Delete ${variant.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {adjustingId === variant.id ? (
                <div className="mt-3 grid gap-2.5 border-t border-border pt-3 sm:grid-cols-[120px_1fr_auto]">
                  <Input
                    type="number"
                    step={1}
                    placeholder="+5 or -1"
                    value={adjustDelta}
                    onChange={e => setAdjustDelta(e.target.value)}
                    aria-label="Stock change"
                  />
                  <Input
                    type="text"
                    placeholder="Required ledger note (e.g. Restock batch)"
                    value={adjustNote}
                    onChange={e => setAdjustNote(e.target.value)}
                    aria-label="Stock adjustment note"
                  />
                  <Button
                    type="button"
                    disabled={adjustBusy}
                    onClick={() => void handleAdjustVariantStock(variant)}
                  >
                    {adjustBusy ? "Saving..." : "Apply"}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={handleSaveVariant}
        className="space-y-4 rounded-[2px] border border-brass/30 bg-stone/40 p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brass">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {editingId ? "Edit variant" : "Add variant"}
          </p>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-muted underline hover:text-text"
            >
              Cancel edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">
              Variant name <span className="text-brass">*</span>
            </span>
            <Input
              placeholder="e.g. Gold / 40mm"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">
              SKU <span className="text-brass">*</span>
            </span>
            <Input
              placeholder="e.g. AA-WAT-GLD-40"
              value={sku}
              onChange={e => setSku(e.target.value.toUpperCase())}
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">Colour (optional)</span>
            <Input
              placeholder="e.g. Rose Gold"
              value={colour}
              onChange={e => setColour(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">Size (optional)</span>
            <Input
              placeholder="e.g. 40mm / 18cm"
              value={size}
              onChange={e => setSize(e.target.value)}
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">Price override (KES)</span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder={`Blank = ${basePrice}`}
              value={priceOverride}
              onChange={e => setPriceOverride(e.target.value)}
            />
          </label>
          {canManageCostPrice ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Cost price (owner only)</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={costPrice}
                onChange={e => setCostPrice(e.target.value)}
              />
            </label>
          ) : null}
          {!editingId ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Initial stock</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={initialStock}
                onChange={e => setInitialStock(e.target.value)}
              />
            </label>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">Sort order</span>
            <Input
              type="number"
              min="0"
              step="1"
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 text-sm">
            <span className="font-medium text-text">Variant image (optional)</span>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://... or upload"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
              />
              <label className="btn-outline shrink-0 cursor-pointer px-3 text-xs">
                {uploadingImage ? "..." : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void handleVariantImageUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">
              Variant image alt text{imageUrl.trim() ? " *" : ""}
            </span>
            <Input
              placeholder="Required when variant image is set"
              value={imageAlt}
              onChange={e => setImageAlt(e.target.value)}
              required={Boolean(imageUrl.trim())}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={active}
              onChange={e => setActive(e.target.checked)}
              className="h-4 w-4 accent-brass"
            />
            <span>Active option on storefront</span>
          </label>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : editingId ? "Update variant" : "Add variant"}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
            {notice}
          </p>
        ) : null}
      </form>
    </section>
  );
}

