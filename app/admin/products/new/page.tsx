import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ProductForm } from "@/components/admin/product-form";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Category } from "@/lib/types";

export const metadata = {
  title: "Add New Product",
  robots: { index: false, follow: false }
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
    <section className="min-w-0 border border-border bg-paper p-4 sm:p-6">
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted transition hover:text-brass sm:mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Products
      </Link>

      <div className="mb-6">
        <p className="text-sm font-medium text-brass">Inventory</p>
        <h2 className="font-serif text-2xl text-text sm:text-3xl">Add new product</h2>
        <p className="mt-1 text-sm text-muted sm:mt-2">
          Fill in the details, upload images, and publish your listing.
        </p>
      </div>
      <ProductForm categories={categories} />
    </section>
  );
}
