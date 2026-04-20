"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageDropzone } from "@/components/admin/image-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

interface ProductFormProps {
  initialProduct?: Product | null;
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        placeholder="Signature gold cuff"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <Textarea
        placeholder="Describe craftsmanship, gemstone profile, and fit."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="Price in KES"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="Stock quantity"
          value={stockQuantity}
          onChange={(e) => setStockQuantity(e.target.value)}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        />
        <Input
          placeholder="Material (optional)"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
        />
      </div>
      <ImageDropzone value={images} onChange={(imgs) => setImages(imgs)} />
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="active" className="text-sm text-ink">
            Product active (visible in storefront)
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isFeatured"
            checked={isFeatured}
            onChange={(e) => setIsFeatured(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="isFeatured" className="text-sm text-ink">
            Featured product (highlight on homepage)
          </label>
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Update product" : "Create product"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
