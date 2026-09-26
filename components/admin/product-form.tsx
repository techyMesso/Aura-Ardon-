"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ImageDropzone } from "@/components/admin/image-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getCategoryFormMessage,
  getInitialProductCategoryId,
  getProductFormCategories
} from "@/lib/admin-product-form";
import type { Category, Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface ProductFormProps {
  categories: Category[];
  initialProduct?: Product | null;
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
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
      {children}
      {required ? <span className="ml-1 text-rose">*</span> : null}
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
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-champagne ${
        checked ? "border-bronze/50 bg-champagne/15" : "border-border bg-white/60"
      }`}
    >
      <span className={`mt-0.5 flex h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${checked ? "bg-bronze" : "bg-muted/45"}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span id={`${id}-description`} className="mt-0.5 block text-sm leading-5 text-muted">
          {description}
        </span>
      </span>
    </button>
  );
}

export function ProductForm({ categories, initialProduct }: ProductFormProps) {
  const router = useRouter();
  const orderedCategories = getProductFormCategories(categories);
  const categoryMessage = getCategoryFormMessage(orderedCategories);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [material, setMaterial] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(initialProduct);
  const selectedCategory = orderedCategories.find(category => category.id === categoryId);
  const numericPrice = Number(price);
  const numericStock = Number(stockQuantity);

  useEffect(() => {
    if (!initialProduct) return;

    setTitle(initialProduct.title);
    setDescription(initialProduct.description);
    setPrice(initialProduct.price);
    setStockQuantity(String(initialProduct.stock_quantity));
    setCategoryId(getInitialProductCategoryId(initialProduct, categories));
    setMaterial(initialProduct.material || "");
    setImages(initialProduct.images);
    setActive(initialProduct.active);
    setIsFeatured(initialProduct.is_featured);
  }, [categories, initialProduct]);

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
    if (!Number.isInteger(numericStock) || numericStock < 0) {
      setError("Stock quantity cannot be negative and must be a whole number.");
      return;
    }
    if (!images.length) {
      setError("Add at least one product image before saving.");
      return;
    }

    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      price: numericPrice,
      stock_quantity: numericStock,
      category_id: categoryId,
      material: material.trim(),
      images,
      active,
      is_featured: isFeatured
    };

    try {
      const response = await fetch(
        initialProduct ? `/api/admin/products/${initialProduct.id}` : "/api/admin/products",
        {
          method: initialProduct ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to save product.");

      setSuccess(isEdit ? "Product updated. Returning to products..." : "Product created. Returning to products...");
      window.setTimeout(() => router.push("/admin/products"), 700);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Error saving product.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-[calc(10rem+env(safe-area-inset-bottom))] md:pb-0" noValidate>
      <section className="rounded-2xl border border-border/70 bg-white/60 p-4 sm:p-6" aria-labelledby="product-details-heading">
        <div className="mb-5">
          <p className="section-label">Product details</p>
          <h3 id="product-details-heading" className="mt-2 font-serif text-2xl text-ink">The essentials</h3>
        </div>
        <div className="space-y-4">
          <div>
            <FormLabel htmlFor="product-title" required>Product title</FormLabel>
            <Input id="product-title" placeholder="Signature gold cuff" value={title} onChange={event => setTitle(event.target.value)} required className="min-h-12 text-base" />
          </div>
          <div>
            <FormLabel htmlFor="product-description" required>Description</FormLabel>
            <Textarea id="product-description" placeholder="Describe craftsmanship, gemstone profile, fit, and care instructions..." value={description} onChange={event => setDescription(event.target.value)} required rows={5} className="min-h-32 resize-none text-base" />
            <p className="mt-1.5 text-xs leading-5 text-muted">Help customers picture the piece: include finish, size or fit, and care details.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FormLabel htmlFor="product-category" required>Category</FormLabel>
              {categoryMessage ? (
                <div className="rounded-xl border border-dashed border-bronze/45 bg-champagne/10 p-4 text-sm text-ink">
                  <p>{categoryMessage}.</p>
                  <Link href="/admin/categories" className="mt-2 inline-flex font-semibold text-bronze underline underline-offset-4 hover:text-rose">
                    Manage categories
                  </Link>
                </div>
              ) : (
                <select id="product-category" value={categoryId} onChange={event => setCategoryId(event.target.value)} required className="min-h-12 w-full rounded-2xl border border-border bg-white/80 px-4 text-base text-ink outline-none transition focus:border-bronze focus:ring-2 focus:ring-champagne/50">
                  <option value="">Select a category</option>
                  {orderedCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <FormLabel htmlFor="product-material" required>Material</FormLabel>
              <Input id="product-material" placeholder="Stainless steel" value={material} onChange={event => setMaterial(event.target.value)} required className="min-h-12 text-base" />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-white/60 p-4 sm:p-6" aria-labelledby="pricing-inventory-heading">
        <div className="mb-5">
          <p className="section-label">Pricing and inventory</p>
          <h3 id="pricing-inventory-heading" className="mt-2 font-serif text-2xl text-ink">Set availability</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FormLabel htmlFor="product-price" required>Price (KSh)</FormLabel>
            <Input id="product-price" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="2500" value={price} onChange={event => setPrice(event.target.value)} required className="min-h-12 text-base" aria-describedby="product-price-help" />
            <p id="product-price-help" className="mt-1.5 text-xs text-muted">Price must be above zero.</p>
          </div>
          <div>
            <FormLabel htmlFor="product-stock" required>Stock quantity</FormLabel>
            <Input id="product-stock" type="number" min="0" step="1" inputMode="numeric" placeholder="10" value={stockQuantity} onChange={event => setStockQuantity(event.target.value)} required className="min-h-12 text-base" aria-describedby="product-stock-help" />
            <p id="product-stock-help" className="mt-1.5 text-xs text-muted">Stock cannot be negative.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-white/60 p-4 sm:p-6" aria-labelledby="product-images-heading">
        <div className="mb-5">
          <p className="section-label">Product images</p>
          <h3 id="product-images-heading" className="mt-2 font-serif text-2xl text-ink">Show the details</h3>
          <p className="mt-1 text-sm text-muted">The first uploaded image is used as the cover image.</p>
        </div>
        <ImageDropzone value={images} onChange={setImages} />
      </section>

      <section className="rounded-2xl border border-border/70 bg-white/60 p-4 sm:p-6" aria-labelledby="publishing-heading">
        <div className="mb-5">
          <p className="section-label">Publishing</p>
          <h3 id="publishing-heading" className="mt-2 font-serif text-2xl text-ink">Choose visibility</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle id="product-active" checked={active} onChange={setActive} label="Active" description="Visible in the storefront." />
          <Toggle id="product-featured" checked={isFeatured} onChange={setIsFeatured} label="Featured" description="Appears in featured collections." />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-champagne/50 bg-sand/60" aria-labelledby="product-preview-heading">
        <div className="border-b border-champagne/35 px-4 py-3 sm:px-6">
          <p className="section-label">Product preview</p>
          <h3 id="product-preview-heading" className="mt-1 font-serif text-2xl text-ink">Before you save</h3>
        </div>
        <div className="flex gap-4 p-4 sm:p-6">
          <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-cream">
            {images[0] ? <Image src={images[0]} alt="Product cover preview" fill sizes="80px" className="object-cover" /> : <span className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">Cover image</span>}
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif text-xl text-ink">{title.trim() || "Untitled product"}</p>
            <p className="mt-1 text-sm text-bronze">{selectedCategory?.name || "No category selected"}</p>
            <p className="mt-2 font-semibold text-ink">{Number.isFinite(numericPrice) && numericPrice > 0 ? formatCurrency(numericPrice) : "Price not set"}</p>
            <p className="mt-1 text-sm text-muted">{Number.isInteger(numericStock) && numericStock >= 0 ? `${numericStock} in stock` : "Stock not set"}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{active ? "Active" : "Inactive"} · {isFeatured ? "Featured" : "Standard"}</p>
          </div>
        </div>
      </section>

      {error ? <div role="alert" className="rounded-xl border border-rose/35 bg-rose/10 p-4 text-sm font-medium text-ink">{error}</div> : null}
      {success ? <div role="status" className="rounded-xl border border-bronze/35 bg-champagne/20 p-4 text-sm font-medium text-ink">{success}</div> : null}

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex gap-3 border-t border-champagne/30 bg-cream/95 px-4 py-3 shadow-[0_-10px_30px_rgba(43,20,37,0.12)] backdrop-blur md:static md:pt-2 md:shadow-none">
        <Button type="submit" disabled={saving || Boolean(categoryMessage)} aria-busy={saving} className="min-h-12 min-w-0 flex-1 text-sm md:flex-none md:text-base">
          {saving ? "Saving product..." : "Save Product"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving} className="min-h-12 min-w-0 flex-1 text-sm md:flex-none md:text-base">
          Cancel
        </Button>
      </div>
    </form>
  );
}
