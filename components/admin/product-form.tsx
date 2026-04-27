"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageDropzone } from "@/components/admin/image-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Product } from "@/lib/types";

interface ProductFormProps {
  initialProduct?: Product | null;
}

// Reusable label for consistent mobile-friendly form labels
function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-ink mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

export function ProductForm({ initialProduct }: ProductFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [category, setCategory] = useState("");
  const [material, setMaterial] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = !!initialProduct;

  useEffect(() => {
    if (initialProduct) {
      setTitle(initialProduct.title);
      setDescription(initialProduct.description);
      setPrice(initialProduct.price);
      setStockQuantity(String(initialProduct.stock_quantity));
      setCategory(initialProduct.category);
      setMaterial(initialProduct.material || "");
      setImages(initialProduct.images);
      setActive(initialProduct.active);
      setIsFeatured(initialProduct.is_featured);
    }
  }, [initialProduct]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      title,
      description,
      price: Number(price),
      stock_quantity: Number(stockQuantity),
      category,
      material: material || null,
      images,
      active,
      is_featured: isFeatured
    };

    try {
      const res = isEdit
        ? await fetch(`/api/admin/products/${initialProduct!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
        : await fetch("/api/admin/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save product");

      router.push("/admin/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving product");
    } finally {
      setSaving(false);
    }
  }

  // Mobile-friendly toggle switch
  function Toggle({
    checked,
    onChange,
    label
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
  }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex items-center gap-3 p-3 rounded-xl border-2 transition-all min-h-[48px] ${
          checked
            ? "border-green-500 bg-green-50"
            : "border-gray-200 bg-gray-50"
        }`}
      >
        <span
          className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
            checked ? "bg-green-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`block w-5 h-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${
              checked ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </span>
        <span className="text-sm font-medium text-ink">{label}</span>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div>
        <FormLabel required>Product Title</FormLabel>
        <Input
          placeholder="Signature gold cuff"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="min-h-[48px] text-base"
        />
      </div>

      {/* Description */}
      <div>
        <FormLabel required>Description</FormLabel>
        <Textarea
          placeholder="Describe craftsmanship, gemstone profile, fit, and any care instructions..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          className="min-h-[120px] text-base resize-none"
        />
      </div>

      {/* Price & Stock - side by side on larger screens, stacked on mobile */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel required>Price (KES)</FormLabel>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="2500"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            className="min-h-[48px] text-base"
          />
        </div>
        <div>
          <FormLabel required>Stock Qty</FormLabel>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="10"
            value={stockQuantity}
            onChange={(e) => setStockQuantity(e.target.value)}
            required
            className="min-h-[48px] text-base"
          />
        </div>
      </div>

      {/* Category & Material */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel required>Category</FormLabel>
          <Input
            placeholder="Jewelry"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className="min-h-[48px] text-base"
          />
        </div>
        <div>
          <FormLabel>Material</FormLabel>
          <Input
            placeholder="Stainless Steel"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="min-h-[48px] text-base"
          />
        </div>
      </div>

      {/* Images */}
      <div>
        <FormLabel>Product Images</FormLabel>
        <ImageDropzone value={images} onChange={(imgs) => setImages(imgs)} />
      </div>

      {/* Status Toggles - big touch targets for mobile */}
      <div className="space-y-3">
        <Toggle
          checked={active}
          onChange={setActive}
          label="Active (visible in shop)"
        />
        <Toggle
          checked={isFeatured}
          onChange={setIsFeatured}
          label="Featured (show on homepage)"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Actions - sticky on mobile for easy thumb access */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 pb-8 sm:pb-0">
        <Button
          type="submit"
          disabled={saving}
          className="min-h-[48px] text-base"
        >
          {saving ? "Saving..." : isEdit ? "Update Product" : "Create Product"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          className="min-h-[48px] text-base"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
