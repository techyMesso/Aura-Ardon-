"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Category } from "@/lib/types";

interface CategoryManagerProps {
  initialCategories: Category[];
}

export function CategoryManager({ initialCategories }: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>(
    initialCategories.sort((a, b) => a.display_order - b.display_order)
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

  function startEdit(cat: Category) {
    setEditingId(cat.id);
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
    setForm({ name: "", slug: "", description: "", image_url: "", parent_id: "", display_order: 0 });
    setError(null);
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        slug: form.slug || form.name.toLowerCase().replace(/\s+/g, "-"),
        description: form.description || null,
        image_url: form.image_url || null,
        parent_id: form.parent_id || null,
        display_order: Number(form.display_order)
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

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      if (editingId) {
        setCategories((c) => c.map((cat) => (cat.id === editingId ? (data as Category) : cat)));
      } else {
        setCategories((c) => [...c, data as Category]);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category?")) return;
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setCategories((c) => c.filter((cat) => cat.id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      console.error(err);
    }
  }

  async function moveCategory(id: string, direction: "up" | "down") {
    const idx = categories.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= categories.length) return;
    const target = categories[targetIdx];
    const current = categories[idx];
    // swap display_order
    const temp = current.display_order;
    const newCurrentOrder = target.display_order;
    const newTargetOrder = temp;
    // update both
    await Promise.all([
      fetch(`/api/admin/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_order: newCurrentOrder })
      }),
      fetch(`/api/admin/categories/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_order: newTargetOrder })
      })
    ]);
    // reorder state
    const newCats = [...categories];
    newCats[idx] = { ...current, display_order: newCurrentOrder };
    newCats[targetIdx] = { ...target, display_order: newTargetOrder };
    setCategories(newCats);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-luxe backdrop-blur">
        <h3 className="font-serif text-2xl text-ink mb-4">
          {editingId ? "Edit category" : "Create new category"}
        </h3>
        <form onSubmit={saveCategory} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              placeholder="Slug (auto-generated if empty)"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </div>
          <Textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Input
            placeholder="Image URL (optional)"
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              placeholder="Parent Category ID (optional)"
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Display Order"
              value={form.display_order}
              onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
              required
            />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 shadow-luxe backdrop-blur">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-sand/50 text-left uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/80">
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td className="px-4 py-4 text-muted">{cat.display_order}</td>
                  <td className="px-4 py-4 font-medium text-ink">{cat.name}</td>
                  <td className="px-4 py-4 text-muted">{cat.slug}</td>
                  <td className="px-4 py-4 text-muted max-w-xs truncate">
                    {cat.description || "-"}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        onClick={() => moveCategory(cat.id, "up")}
                        disabled={cat.display_order === 0}
                        className="h-8 w-8 p-0"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => moveCategory(cat.id, "down")}
                        disabled={cat.display_order === categories.length - 1}
                        className="h-8 w-8 p-0"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                       <Button
                         variant="ghost"
                         className="h-8 w-8 p-0"
                         onClick={() => startEdit(cat)}
                       >
                         <Pencil className="h-4 w-4" />
                       </Button>
                       <Button
                         variant="destructive"
                         className="h-8 w-8 p-0"
                         onClick={() => deleteCategory(cat.id)}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    No categories yet.
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
