import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ProductForm } from "@/components/admin/product-form";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { Category } from "@/lib/types";

export const metadata = {
  title: "Add New Product | Auro Ardon Admin",
  robots: { index: false, follow: false },
};

export default async function NewProductPage() {
  let categories: Category[] = [];
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    categories = data ?? [];
  } catch (error) {
    logger.error("Failed to fetch product form categories", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return (
    <section className="min-w-0 rounded-[2rem] border border-white/60 bg-white/70 p-4 shadow-luxe backdrop-blur sm:p-6">
      {/* Back + header */}
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-bronze mb-4 sm:mb-6 transition"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Products
      </Link>

      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">
          Inventory
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl text-ink">Add new jewelry piece</h2>
        <p className="mt-1 sm:mt-2 text-sm text-muted">
          Fill in the details, upload images, and publish your listing.
        </p>
      </div>
      <ProductForm categories={categories} />
    </section>
  );
}
