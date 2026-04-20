"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Pencil, Power, Trash2, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

interface ProductListProps {
  initialProducts: Product[];
}

export function ProductList({ initialProducts }: ProductListProps) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) =>
      p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }, [products, search]);

  async function toggleActive(product: Product) {
    const newActive = !product.active;
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive })
      });
      if (!response.ok) throw new Error("Failed");
      setProducts((current) =>
        current.map((p) => (p.id === product.id ? { ...p, active: newActive } : p))
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this jewelry piece permanently?")) return;
    try {
      const response = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed");
      setProducts((current) => current.filter((p) => p.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 w-full sm:w-72"
          />
        </div>
        <Link href="/admin/products/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Product
          </Button>
        </Link>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 shadow-luxe backdrop-blur">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-sand/50 text-left uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/80">
              {filtered.map((product) => (
                <tr key={product.id}>
                  <td className="px-4 py-4 font-medium text-ink">{product.title}</td>
                  <td className="px-4 py-4 text-muted">{product.category}</td>
                  <td className="px-4 py-4 text-muted">{formatCurrency(product.price)}</td>
                  <td className="px-4 py-4 text-muted">{product.stock_quantity}</td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => toggleActive(product)}
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition ${
                        product.active
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Power className="mr-1 h-3 w-3" />
                      {product.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <Link href={`/admin/products/${product.id}/edit`}>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="destructive"
                        className="h-8 w-8 p-0"
                        onClick={() => deleteProduct(product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No products found.
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
