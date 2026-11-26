"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ImageDropzone } from "@/components/admin/image-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { resolveProductStatus } from "@/lib/admin-product-filters";
import {
  getCategoryFormMessage,
  getInitialProductCategoryId,
  getProductFormCategories
} from "@/lib/admin-product-form";
import { toCatalogSlug } from "@/lib/catalog";
import type { Category, Product, ProductStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface ProductFormProps {
  categories: Category[];
  initialProduct?: Product | null;
  canManageCostPrice?: boolean;
}

function FormLabel({
  children,
  htmlFor,
  required
}: {
  children: React.ReactNode;
  htmlFor: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-text">
      {children}
      {required ? <span className="ml-1 text-brass">*</span> : null}
    </label>
  );
}

function Toggle({
  checked,
  description,
  id,
  label,
  onChange
}: {
  checked: boolean;
  description: string;
  id: string;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={`${id}-description`}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-start gap-3 border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brass ${
        checked ? "border-brass/60 bg-stone" : "border-border bg-paper"
      }`}
    >
      <span
        className={`mt-0.5 flex h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
          checked ? "bg-brass" : "bg-muted/45"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
      <span>
        <span className="block text-sm font-semibold text-text">{label}</span>
        <span id={`${id}-description`} className="mt-0.5 block text-sm leading-5 text-muted">
          {description}
        </span>
      </span>
    </button>
  );
}

export function ProductForm({
  categories,
  initialProduct,
  canManageCostPrice = false
}: ProductFormProps) {
  const router = useRouter();
  const orderedCategories = getProductFormCategories(categories);
  const categoryMessage = getCategoryFormMessage(orderedCategories);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [material, setMaterial] = useState("");
  const [finish, setFinish] = useState("");
  const [sizeLabel, setSizeLabel] = useState("");
  const [waterResistance, setWaterResistance] = useState("");
  const [warranty, setWarranty] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [netWeight, setNetWeight] = useState("");
  const [expiryInfo, setExpiryInfo] = useState("");
  const [inTheBox, setInTheBox] = useState("");
  const [care, setCare] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageAlts, setImageAlts] = useState<string[]>([]);
  const [status, setStatus] = useState<ProductStatus>("active");
  const [isFeatured, setIsFeatured] = useState(false);
  const [featuredOrder, setFeaturedOrder] = useState("0");
  const [isNewIn, setIsNewIn] = useState(false);
  const [newInOrder, setNewInOrder] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(initialProduct);
  const selectedCategory = orderedCategories.find(
    category => category.id === categoryId
  );
  const numericPrice = Number(price);
  const numericCost = costPrice.trim() ? Number(costPrice) : null;
  const numericStock = Number(stockQuantity);

  useEffect(() => {
    if (!initialProduct) return;

    setTitle(initialProduct.title);
    setSlug(initialProduct.slug || "");
    setDescription(initialProduct.description);
    setPrice(initialProduct.price);
    setCompareAtPrice(initialProduct.compare_at_price ?? "");
    if (canManageCostPrice) {
      setCostPrice(initialProduct.cost_price ?? "");
    }
    setStockQuantity(String(initialProduct.stock_quantity));
    setCategoryId(getInitialProductCategoryId(initialProduct, categories));
    setMaterial(initialProduct.material || "");
    setFinish(initialProduct.finish || "");
    setSizeLabel(initialProduct.size_label || "");
    setWaterResistance(initialProduct.water_resistance || "");
    setWarranty(initialProduct.warranty || "");
    setIngredients(initialProduct.ingredients || "");
    setNetWeight(initialProduct.net_weight || "");
    setExpiryInfo(initialProduct.expiry_info || "");
    setInTheBox(initialProduct.in_the_box || "");
    setCare(initialProduct.care || "");
    setImages(initialProduct.images);
    setImageAlts(
      initialProduct.images.map(
        (_, idx) =>
          initialProduct.image_alts?.[idx] ||
          `${initialProduct.title} — photo ${idx + 1}`
      )
    );
    setStatus(resolveProductStatus(initialProduct));
    setIsFeatured(initialProduct.is_featured);
    setFeaturedOrder(String(initialProduct.featured_order ?? 0));
    setIsNewIn(Boolean(initialProduct.is_new_in));
    setNewInOrder(String(initialProduct.new_in_order ?? 0));
  }, [canManageCostPrice, categories, initialProduct]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setError(null);
    setSuccess(null);

    if (!categoryId) {
      setError("Select a category before saving this product.");
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setError("Price must be above zero.");
      return;
    }
    const trimmedCompareAt = compareAtPrice.trim();
    const numericCompareAt = trimmedCompareAt ? Number(trimmedCompareAt) : null;
    if (
      numericCompareAt !== null &&
      (!Number.isFinite(numericCompareAt) || numericCompareAt <= numericPrice)
    ) {
      setError("Compare-at price must be higher than the selling price.");
      return;
    }
    if (
      canManageCostPrice &&
      numericCost !== null &&
      (!Number.isFinite(numericCost) || numericCost < 0)
    ) {
      setError("Cost price cannot be negative.");
      return;
    }
    if (!isEdit && (!Number.isInteger(numericStock) || numericStock < 0)) {
      setError("Stock quantity cannot be negative and must be a whole number.");
      return;
    }
    if (!images.length) {
      setError("Add at least one product image before saving.");
      return;
    }

    const cleanedAlts = images.map((_, idx) => (imageAlts[idx] ?? "").trim());
    const missingAltIdx = cleanedAlts.findIndex(alt => alt.length < 2);
    if (missingAltIdx !== -1) {
      setError(
        `Alt text is required for photo ${missingAltIdx + 1} (at least 2 characters).`
      );
      return;
    }

    setSaving(true);
    const normalizedSlug = slug.trim() ? toCatalogSlug(slug) : null;

    const payload: Record<string, unknown> = {
      title: title.trim(),
      ...(normalizedSlug ? { slug: normalizedSlug } : {}),
      description: description.trim(),
      price: numericPrice,
      compare_at_price: numericCompareAt,
      category_id: categoryId,
      material: material.trim(),
      finish: finish.trim() || null,
      size_label: sizeLabel.trim() || null,
      water_resistance: waterResistance.trim() || null,
      warranty: warranty.trim() || null,
      ingredients: ingredients.trim() || null,
      net_weight: netWeight.trim() || null,
      expiry_info: expiryInfo.trim() || null,
      in_the_box: inTheBox.trim() || null,
      care: care.trim() || null,
      images,
      image_alts: cleanedAlts,
      status,
      active: status === "active",
      is_featured: isFeatured,
      featured_order: Math.max(0, Math.floor(Number(featuredOrder) || 0)),
      is_new_in: isNewIn,
      new_in_order: Math.max(0, Math.floor(Number(newInOrder) || 0))
    };

    if (canManageCostPrice) {
      payload.cost_price = numericCost;
    }

    if (!isEdit) {
      payload.stock_quantity = numericStock;
    }

    try {
      const response = await fetch(
        initialProduct
          ? `/api/admin/products/${initialProduct.id}`
          : "/api/admin/products",
        {
          method: initialProduct ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = (await response.json()) as {
        error?: string;
        redirectCreated?: { from: string; to: string; statusCode: number } | null;
      };
      if (!response.ok) throw new Error(data.error || "Failed to save product.");

      setSuccess(
        data.redirectCreated
          ? `Product updated and 301 redirect created (${data.redirectCreated.from} → ${data.redirectCreated.to}). Returning to products...`
          : isEdit
            ? "Product updated. Returning to products..."
            : "Product created. Returning to products..."
      );
      router.push("/admin/products");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Error saving product."
      );
      setSaving(false);
    }
  }

  const estimatedProfit =
    canManageCostPrice &&
    Number.isFinite(numericPrice) &&
    numericPrice > 0 &&
    numericCost !== null &&
    Number.isFinite(numericCost)
      ? numericPrice - numericCost
      : null;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 pb-[calc(10rem+env(safe-area-inset-bottom))] md:pb-0"
      noValidate
    >
      <section
        className="border border-border bg-paper p-4 sm:p-6"
        aria-labelledby="product-details-heading"
      >
        <div className="mb-5">
          <p className="text-sm font-medium text-brass">Product details</p>
          <h3 id="product-details-heading" className="mt-1 font-serif text-2xl text-text">
            The essentials
          </h3>
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FormLabel htmlFor="product-title" required>
                Product title
              </FormLabel>
              <Input
                id="product-title"
                placeholder="Signature gold cuff"
                value={title}
                onChange={event => setTitle(event.target.value)}
                required
                className="min-h-12 text-base"
              />
            </div>
            <div>
              <FormLabel htmlFor="product-slug">URL slug</FormLabel>
              <Input
                id="product-slug"
                placeholder="Auto-generated from title"
                value={slug}
                onChange={event => setSlug(event.target.value)}
                className="min-h-12 text-base"
              />
              <p className="mt-1.5 text-xs text-muted">
                {isEdit
                  ? "Changing the slug automatically creates a 301 redirect from the old /p/ URL."
                  : "Leave blank to generate cleanly from the title."}
              </p>
            </div>
          </div>

          <div>
            <FormLabel htmlFor="product-description" required>
              Description
            </FormLabel>
            <Textarea
              id="product-description"
              placeholder="Describe the finish, fit, ingredients, or packaging..."
              value={description}
              onChange={event => setDescription(event.target.value)}
              required
              rows={5}
              className="min-h-32 resize-none text-base"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FormLabel htmlFor="product-category" required>
                Category
              </FormLabel>
              {categoryMessage ? (
                <div className="rounded-[2px] border border-dashed border-brass/50 bg-stone p-4 text-sm text-text">
                  <p>{categoryMessage}.</p>
                  <Link
                    href="/admin/categories"
                    className="mt-2 inline-flex font-semibold text-brass underline underline-offset-4 hover:opacity-80"
                  >
                    Manage categories
                  </Link>
                </div>
              ) : (
                <select
                  id="product-category"
                  value={categoryId}
                  onChange={event => setCategoryId(event.target.value)}
                  required
                  className="min-h-12 w-full rounded-[2px] border border-text/20 bg-paper px-4 text-base text-text outline-none transition focus:border-brass"
                >
                  <option value="">Select a category</option>
                  {orderedCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <FormLabel htmlFor="product-material" required>
                Material
              </FormLabel>
              <Input
                id="product-material"
                placeholder="Stainless steel"
                value={material}
                onChange={event => setMaterial(event.target.value)}
                required
                className="min-h-12 text-base"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FormLabel htmlFor="product-finish">Finish</FormLabel>
              <Input
                id="product-finish"
                placeholder="18k gold PVD mirror polish"
                value={finish}
                onChange={event => setFinish(event.target.value)}
                className="min-h-12 text-base"
              />
            </div>
            <div>
              <FormLabel htmlFor="product-size-label">Length / size / case</FormLabel>
              <Input
                id="product-size-label"
                placeholder="45 cm + 5 cm extender or 40mm case"
                value={sizeLabel}
                onChange={event => setSizeLabel(event.target.value)}
                className="min-h-12 text-base"
              />
            </div>
            <div>
              <FormLabel htmlFor="product-in-the-box">In the box</FormLabel>
              <Input
                id="product-in-the-box"
                placeholder="Auro Ardon pouch and polishing cloth"
                value={inTheBox}
                onChange={event => setInTheBox(event.target.value)}
                className="min-h-12 text-base"
              />
            </div>
            <div>
              <FormLabel htmlFor="product-care">Care</FormLabel>
              <Input
                id="product-care"
                placeholder="Wipe dry after wear; store in pouch"
                value={care}
                onChange={event => setCare(event.target.value)}
                className="min-h-12 text-base"
              />
            </div>
          </div>

          <details className="rounded-[2px] border border-border bg-stone/40 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-text">
              Watch &amp; beauty specifications (optional)
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <FormLabel htmlFor="product-water-resistance">Water resistance</FormLabel>
                <Input
                  id="product-water-resistance"
                  placeholder="e.g. 3 ATM splash-resistant"
                  value={waterResistance}
                  onChange={e => setWaterResistance(e.target.value)}
                />
              </div>
              <div>
                <FormLabel htmlFor="product-warranty">Warranty</FormLabel>
                <Input
                  id="product-warranty"
                  placeholder="e.g. 6-month movement warranty"
                  value={warranty}
                  onChange={e => setWarranty(e.target.value)}
                />
              </div>
              <div>
                <FormLabel htmlFor="product-net-weight">Net weight / volume</FormLabel>
                <Input
                  id="product-net-weight"
                  placeholder="e.g. 5 ml / 0.17 fl oz"
                  value={netWeight}
                  onChange={e => setNetWeight(e.target.value)}
                />
              </div>
              <div>
                <FormLabel htmlFor="product-expiry">Expiry / shelf life</FormLabel>
                <Input
                  id="product-expiry"
                  placeholder="e.g. 12 months after opening"
                  value={expiryInfo}
                  onChange={e => setExpiryInfo(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <FormLabel htmlFor="product-ingredients">Ingredients</FormLabel>
                <Textarea
                  id="product-ingredients"
                  rows={2}
                  placeholder="Key ingredients for lip care / beauty items"
                  value={ingredients}
                  onChange={e => setIngredients(e.target.value)}
                />
              </div>
            </div>
          </details>
        </div>
      </section>

      <section
        className="border border-border bg-paper p-4 sm:p-6"
        aria-labelledby="pricing-inventory-heading"
      >
        <div className="mb-5">
          <p className="text-sm font-medium text-brass">Pricing and inventory</p>
          <h3 id="pricing-inventory-heading" className="mt-1 font-serif text-2xl text-text">
            Set availability
          </h3>
        </div>
        <div
          className={`grid gap-4 ${canManageCostPrice ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}
        >
          <div>
            <FormLabel htmlFor="product-price" required>
              Price (KES)
            </FormLabel>
            <Input
              id="product-price"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              placeholder="2500"
              value={price}
              onChange={event => setPrice(event.target.value)}
              required
              className="min-h-12 text-base"
            />
          </div>
          <div>
            <FormLabel htmlFor="product-compare-at-price">
              Compare-at price (KES)
            </FormLabel>
            <Input
              id="product-compare-at-price"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              placeholder="Optional (e.g. 3200)"
              value={compareAtPrice}
              onChange={event => setCompareAtPrice(event.target.value)}
              className="min-h-12 text-base"
            />
            <p className="mt-1.5 text-xs text-muted">
              Must exceed price to show a Sale badge.
            </p>
          </div>
          {canManageCostPrice ? (
            <div>
              <FormLabel htmlFor="product-cost-price">
                Cost price (KES, owner only)
              </FormLabel>
              <Input
                id="product-cost-price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Optional (private)"
                value={costPrice}
                onChange={event => setCostPrice(event.target.value)}
                className="min-h-12 text-base"
              />
              <p className="mt-1.5 text-xs text-muted">
                {estimatedProfit !== null
                  ? `Est. margin: ${formatCurrency(estimatedProfit)} (${Math.round((estimatedProfit / numericPrice) * 100)}%)`
                  : "Never sent to storefront or staff browsers."}
              </p>
            </div>
          ) : null}
          <div>
            <FormLabel htmlFor="product-stock" required={!isEdit}>
              {isEdit ? "Current stock (ledger managed)" : "Initial stock quantity"}
            </FormLabel>
            <Input
              id="product-stock"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="10"
              value={stockQuantity}
              onChange={event => setStockQuantity(event.target.value)}
              required={!isEdit}
              disabled={isEdit}
              className="min-h-12 text-base disabled:cursor-not-allowed disabled:bg-stone disabled:opacity-80"
            />
            <p className="mt-1.5 text-xs text-muted">
              {isEdit
                ? "Use the Variants or Stock Ledger section below (requires a note)."
                : "Recorded as initial_stock in the ledger."}
            </p>
          </div>
        </div>
      </section>

      <section
        className="border border-border bg-paper p-4 sm:p-6"
        aria-labelledby="product-images-heading"
      >
        <div className="mb-5">
          <p className="text-sm font-medium text-brass">Product images</p>
          <h3 id="product-images-heading" className="mt-1 font-serif text-2xl text-text">
            Show the details
          </h3>
          <p className="mt-1 text-sm text-muted">
            Uploads are compressed to WebP (max 2000 px) in your browser. Drag to reorder and fill in required alt text for every image.
          </p>
        </div>
        <ImageDropzone
          value={images}
          alts={imageAlts}
          onChange={(nextUrls, nextAlts) => {
            setImages(nextUrls);
            setImageAlts(nextAlts);
          }}
        />
      </section>

      <section
        className="border border-border bg-paper p-4 sm:p-6"
        aria-labelledby="publishing-heading"
      >
        <div className="mb-5">
          <p className="text-sm font-medium text-brass">Publishing &amp; homepage placement</p>
          <h3 id="publishing-heading" className="mt-1 font-serif text-2xl text-text">
            Status &amp; pinning
          </h3>
        </div>

        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="product-status" required>
              Product status
            </FormLabel>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {(
                [
                  {
                    value: "active",
                    label: "Active",
                    desc: "Live in storefront & search."
                  },
                  {
                    value: "draft",
                    label: "Draft",
                    desc: "Hidden while preparing listing."
                  },
                  {
                    value: "archived",
                    label: "Archived",
                    desc: "Hidden from store; kept on past orders & invoices."
                  }
                ] as const
              ).map(option => {
                const selected = status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    aria-pressed={selected}
                    className={`rounded-[2px] border p-3.5 text-left transition ${
                      selected
                        ? "border-brass bg-stone ring-1 ring-brass"
                        : "border-border bg-paper hover:border-brass/60"
                    }`}
                  >
                    <p className="text-sm font-semibold text-text">{option.label}</p>
                    <p className="mt-0.5 text-xs text-muted">{option.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2.5">
              <Toggle
                id="product-featured"
                checked={isFeatured}
                onChange={setIsFeatured}
                label="Featured on homepage"
                description="Pin to hero / featured showcase."
              />
              {isFeatured ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                    Featured display order (lower shows first)
                  </span>
                  <Input
                    type="number"
                    min="0"
                    max="9999"
                    value={featuredOrder}
                    onChange={e => setFeaturedOrder(e.target.value)}
                  />
                </label>
              ) : null}
            </div>

            <div className="space-y-2.5">
              <Toggle
                id="product-new-in"
                checked={isNewIn}
                onChange={setIsNewIn}
                label='Pin to "New in"'
                description='Place at the front of the homepage "New in" rail.'
              />
              {isNewIn ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                    New in display order (lower shows first)
                  </span>
                  <Input
                    type="number"
                    min="0"
                    max="9999"
                    value={newInOrder}
                    onChange={e => setNewInOrder(e.target.value)}
                  />
                </label>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section
        className="overflow-hidden border border-border bg-stone"
        aria-labelledby="product-preview-heading"
      >
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <p className="text-sm font-medium text-brass">Product preview</p>
          <h3 id="product-preview-heading" className="mt-1 font-serif text-2xl text-text">
            Before you save
          </h3>
        </div>
        <div className="flex gap-4 p-4 sm:p-6">
          <div className="relative h-24 w-20 shrink-0 overflow-hidden bg-paper">
            {images[0] ? (
              <Image
                src={images[0]}
                alt={imageAlts[0] || "Product cover preview"}
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">
                Cover image
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif text-xl text-text">
              {title.trim() || "Untitled product"}
            </p>
            <p className="mt-1 text-sm text-brass">
              {selectedCategory?.name || "No category selected"}
            </p>
            <p className="mt-2 font-semibold text-text">
              {Number.isFinite(numericPrice) && numericPrice > 0
                ? formatCurrency(numericPrice)
                : "Price not set"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {Number.isInteger(numericStock) && numericStock >= 0
                ? `${numericStock} in stock`
                : "Stock not set"}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {status}
              {isFeatured ? ` · Featured (#${featuredOrder})` : ""}
              {isNewIn ? ` · New in (#${newInOrder})` : ""}
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-[2px] border border-red-400/50 bg-red-500/10 p-4 text-sm font-medium text-red-600 dark:text-red-400"
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          role="status"
          className="rounded-[2px] border border-brass/50 bg-stone p-4 text-sm font-medium text-text"
        >
          {success}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex gap-3 border-t border-border bg-paper/95 px-4 py-3 backdrop-blur md:static md:border-t-0 md:bg-transparent md:px-0 md:pt-2">
        <Button
          type="submit"
          disabled={saving || Boolean(categoryMessage)}
          aria-busy={saving}
          className="min-h-12 min-w-0 flex-1 text-sm md:flex-none md:text-base"
        >
          {saving ? "Saving product..." : "Save Product"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={saving}
          className="min-h-12 min-w-0 flex-1 text-sm md:flex-none md:text-base"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
