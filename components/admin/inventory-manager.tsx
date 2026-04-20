"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { ImageDropzone } from "@/components/admin/image-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

interface InventoryManagerProps {
  initialProducts: Product[];
}

interface ProductFormState {
  title: string;
  description: string;
  price: string;
  stock_quantity: string;
  category: string;
  material: string;
  images: string[];
}

const emptyForm: ProductFormState = {
  title: "",
  description: "",
  price: "",
  stock_quantity: "",
  category: "",
  material: "",
  images: []
};

export function InventoryManager({ initialProducts }: InventoryManagerProps) {
  const [products, setProducts] = useState(initialProducts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sortedProducts = useMemo(
    () =>
      [...products].sort((left, right) =>
        right.created_at.localeCompare(left.created_at)
      ),
    [products]
  );

  function startEditing(product: Product) {
    setEditingId(product.id);
    setForm({
      title: product.title,
      description: product.description,
      price: product.price,
      stock_quantity: String(product.stock_quantity),
      category: product.category,
      material: product.material || "", // Handle null
      images: product.images
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      title: form.title,
      description: form.description,
      price: Number(form.price),
      stock_quantity: Number(form.stock_quantity),
      category: form.category,
      material: form.material,
      images: form.images
    };

    const endpoint = editingId
      ? `/api/admin/products/${editingId}`
      : "/api/admin/products";
    const method = editingId ? "PATCH" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { product?: Product; error?: string };

      if (!response.ok || !data.product) {
        throw new Error(data.error ?? "Unable to save product.");
      }

      setProducts((current) =>
        editingId
          ? current.map((product) =>
              product.id === editingId ? data.product! : product
            )
          : [data.product!, ...current]
      );
      resetForm();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save product."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this jewelry piece permanently?");

    if (!confirmed) {
      return;
    }

    setError(null);

    try {
      const response = await fetch(`/api/admin/products/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to delete product.");
      }

      setProducts((current) => current.filter((product) => product.id !== id));

      if (editingId === id) {
        resetForm();
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to delete product."
      );
    }
  }

  return (
    <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-4 rounded-[2rem] border border-white/50 bg-white/70 p-6 shadow-luxe backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">
              Inventory
            </p>
            <h2 className="font-serif text-3xl text-ink">Jewelry catalog</h2>
          </div>
          <Button variant="ghost" onClick={resetForm}>
            <Plus className="mr-2 h-4 w-4" />
            New piece
          </Button>
        </div>
        <div className="overflow-hidden rounded-[1.5rem] border border-border">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-sand/50 text-left uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/80">
                {sortedProducts.map((product) => (
                  <tr key={product.id}>
                    <td className="px-4 py-4 font-medium text-ink">{product.title}</td>
                    <td className="px-4 py-4 text-muted">{product.category}</td>
                    <td className="px-4 py-4 text-muted">
                      {formatCurrency(product.price)}
                    </td>
                    <td className="px-4 py-4 text-muted">{product.stock_quantity}</td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => startEditing(product)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => void handleDelete(product.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!sortedProducts.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted">
                      No jewelry pieces yet. Add the first collection item below.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/50 bg-card p-6 shadow-luxe">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">
            {editingId ? "Edit Piece" : "Add Piece"}
          </p>
          <h2 className="font-serif text-3xl text-ink">
            {editingId ? "Refine inventory details" : "Create a new listing"}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            placeholder="Signature gold cuff"
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            required
          />
          <Textarea
            placeholder="Describe craftsmanship, gemstone profile, and fit."
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value
              }))
            }
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Price in KES"
              value={form.price}
              onChange={(event) =>
                setForm((current) => ({ ...current, price: event.target.value }))
              }
              required
            />
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="Stock quantity"
              value={form.stock_quantity}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  stock_quantity: event.target.value
                }))
              }
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              placeholder="Category"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
              required
            />
            <Input
              placeholder="Material (optional)"
              value={form.material}
              onChange={(event) =>
                setForm((current) => ({ ...current, material: event.target.value }))
              }
            />
          </div>
          <ImageDropzone
            value={form.images}
            onChange={(images) => setForm((current) => ({ ...current, images }))}
          />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Update piece" : "Create piece"}
            </Button>
            {editingId ? (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
