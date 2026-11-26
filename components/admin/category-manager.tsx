"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toCatalogSlug } from "@/lib/catalog";
import type { Category } from "@/lib/types";

interface CategoryManagerProps {
  initialCategories: Category[];
}

function sortCategories(list: Category[]) {
  return [...list].sort(
    (left, right) =>
      left.display_order - right.display_order || left.name.localeCompare(right.name)
  );
}

export function CategoryManager({ initialCategories }: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>(() =>
    sortCategories(initialCategories)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    image_url: "",
    parent_id: "",
    display_order: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setError(null);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || "",
      image_url: cat.image_url || "",
      parent_id: cat.parent_id || "",
      display_order: cat.display_order
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      name: "",
      slug: "",
      description: "",
      image_url: "",
      parent_id: "",
      display_order: categories.length
    });
    setError(null);
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const normalizedSlug = toCatalogSlug(form.slug || form.name);
      const payload = {
        name: form.name.trim(),
        slug: normalizedSlug || undefined,
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        parent_id: form.parent_id.trim() || null,
        display_order: Number.isFinite(Number(form.display_order))
          ? Math.max(0, Math.floor(Number(form.display_order)))
          : 0
      };
      const res = editingId
        ? await fetch(`/api/admin/categories/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
        : await fetch("/api/admin/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

      const data = (await res.json()) as Category & { error?: string };
      if (!res.ok) throw new Error(data.error || "Unable to save category.");

      if (editingId) {
        setCategories(current =>
          sortCategories(current.map(cat => (cat.id === editingId ? data : cat)))
        );
      } else {
        setCategories(current => sortCategories([...current, data]));
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save category.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category? Products in it will become uncategorized.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Unable to delete category.");
      setCategories(current => current.filter(cat => cat.id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete category.");
    }
  }

  async function moveCategory(id: string, direction: "up" | "down") {
    if (reordering) return;
    const idx = categories.findIndex(c => c.id === id);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= categories.length) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, moved);

    // Assign deterministic sequential display_order values so ties never cause no-ops.
    const updates = reordered
      .map((cat, order) => ({ cat, order }))
      .filter(({ cat, order }) => cat.display_order !== order);

    if (!updates.length) return;

    setReordering(true);
    setError(null);
    try {
      const responses = await Promise.all(
        updates.map(({ cat, order }) =>
          fetch(`/api/admin/categories/${cat.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_order: order })
          })
        )
      );

      if (responses.some(res => !res.ok)) {
        throw new Error("Could not save the updated category order. Try again.");
      }

      setCategories(
        reordered.map((cat, order) => ({ ...cat, display_order: order }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reorder categories.");
    } finally {
      setReordering(false);
    }
  }

  const parentOptions = categories.filter(cat => cat.id !== editingId);

  return (
    <section className="min-w-0 space-y-6">
      <div className="min-w-0 border border-border bg-paper p-4 sm:p-6">
        <p className="text-sm font-medium text-brass">Catalog structure</p>
        <h3 className="mb-4 mt-1 font-serif text-2xl text-text">
          {editingId ? "Edit category" : "Create new category"}
        </h3>
        <form
          onSubmit={saveCategory}
          className="space-y-4 pb-[calc(10rem+env(safe-area-inset-bottom))] md:pb-0"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="text-text">Name</span>
              <Input
                placeholder="e.g. Necklaces"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-text">Slug (optional)</span>
              <Input
                placeholder="Auto-generated from name"
                value={form.slug}
                onChange={e => setForm({ ...form, slug: e.target.value })}
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="text-text">Description (optional)</span>
            <Textarea
              placeholder="Short collection summary shown on category pages"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-text">Cover image URL (optional)</span>
            <Input
              type="url"
              placeholder="https://...supabase.co/storage/v1/object/public/product-images/..."
              value={form.image_url}
              onChange={e => setForm({ ...form, image_url: e.target.value })}
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="text-text">Parent category (optional)</span>
              <select
                value={form.parent_id}
                onChange={e => setForm({ ...form, parent_id: e.target.value })}
                className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 text-sm text-text outline-none transition focus:border-brass"
              >
                <option value="">None (top-level category)</option>
                {parentOptions.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-text">Display order</span>
              <Input
                type="number"
                min={0}
                value={form.display_order}
                onChange={e =>
                  setForm({ ...form, display_order: Number(e.target.value) })
                }
                required
              />
            </label>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex gap-3 border-t border-border bg-paper/95 px-4 py-3 backdrop-blur md:static md:border-t-0 md:bg-transparent md:px-0 md:py-0">
            <Button
              type="submit"
              disabled={saving}
              className="min-h-12 min-w-0 flex-1 text-sm md:flex-none"
            >
              {saving ? "Saving..." : editingId ? "Update category" : "Create category"}
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={resetForm}
                className="min-h-12 min-w-0 flex-1 text-sm md:flex-none"
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="space-y-3 md:hidden">
        {categories.map((cat, index) => (
          <article key={cat.id} className="border border-border bg-paper p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-text">{cat.name}</p>
                <p className="mt-1 truncate text-sm text-muted">/{cat.slug}</p>
                {cat.description ? (
                  <p className="mt-2 text-sm leading-6 text-muted">{cat.description}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-sm text-muted">#{cat.display_order}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              <Button
                variant="ghost"
                onClick={() => void moveCategory(cat.id, "up")}
                disabled={index === 0 || reordering}
                className="min-h-11 px-3 text-sm"
                aria-label={`Move ${cat.name} up`}
              >
                <ArrowUp className="mr-1 h-4 w-4" aria-hidden />
                Up
              </Button>
              <Button
                variant="ghost"
                onClick={() => void moveCategory(cat.id, "down")}
                disabled={index === categories.length - 1 || reordering}
                className="min-h-11 px-3 text-sm"
                aria-label={`Move ${cat.name} down`}
              >
                <ArrowDown className="mr-1 h-4 w-4" aria-hidden />
                Down
              </Button>
              <Button
                variant="ghost"
                onClick={() => startEdit(cat)}
                className="min-h-11 px-3 text-sm"
              >
                <Pencil className="mr-1 h-4 w-4" aria-hidden />
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={() => void deleteCategory(cat.id)}
                className="min-h-11 px-3 text-sm"
              >
                <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                Delete
              </Button>
            </div>
          </article>
        ))}
        {!categories.length ? (
          <div className="border border-dashed border-border bg-stone/50 p-8 text-center">
            <p className="font-medium text-text">No categories yet</p>
            <p className="mt-1 text-sm text-muted">
              Create a category to organize the catalog.
            </p>
          </div>
        ) : null}
      </div>

      <div className="hidden min-w-0 overflow-hidden border border-border bg-paper md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-stone text-left text-xs uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-paper">
              {categories.map((cat, index) => (
                <tr key={cat.id} className="hover:bg-stone/50">
                  <td className="px-4 py-4 text-muted">{cat.display_order}</td>
                  <td className="px-4 py-4 font-medium text-text">{cat.name}</td>
                  <td className="px-4 py-4 text-muted">{cat.slug}</td>
                  <td className="max-w-xs truncate px-4 py-4 text-muted">
                    {cat.description || "-"}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        onClick={() => void moveCategory(cat.id, "up")}
                        disabled={index === 0 || reordering}
                        className="h-9 w-9 p-0"
                        aria-label={`Move ${cat.name} up`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => void moveCategory(cat.id, "down")}
                        disabled={index === categories.length - 1 || reordering}
                        className="h-9 w-9 p-0"
                        aria-label={`Move ${cat.name} down`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-9 w-9 p-0"
                        onClick={() => startEdit(cat)}
                        aria-label={`Edit ${cat.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        className="h-9 w-9 p-0"
                        onClick={() => void deleteCategory(cat.id)}
                        aria-label={`Delete ${cat.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    No categories yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
