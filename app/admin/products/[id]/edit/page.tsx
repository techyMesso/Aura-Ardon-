import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ProductForm } from "@/components/admin/product-form";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Category, Product } from "@/lib/types";

export const metadata = {
  title: "Edit Product",
  robots: { index: false, follow: false }
};

export default async function EditProductPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let product: Product | null = null;
  let categories: Category[] = [];

  try {
    const supabase = createAdminSupabaseClient();
    const [{ data: productData, error: productError }, { data: categoryData, error: categoryError }] =
      await Promise.all([
        supabase.from("products").select("*").eq("id", id).single(),
        supabase
          .from("categories")
          .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
          .order("display_order", { ascending: true })
          .order("name", { ascending: true })
      ]);
    if (!productError && productData) product = productData as Product;
    if (categoryError) throw new Error(categoryError.message);
    categories = categoryData ?? [];
  } catch (error) {
    logger.error("Failed to fetch admin product", {
      id,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  if (!product) notFound();

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
        <h2 className="font-serif text-3xl text-text">Edit product</h2>
        <p className="mt-2 text-sm text-muted">
          Update details, images, and availability.
        </p>
      </div>
      <ProductForm initialProduct={product} categories={categories} />
    </section>
  );
}
