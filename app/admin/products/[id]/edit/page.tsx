import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { Category, Product } from "@/lib/types";
import { ProductForm } from "@/components/admin/product-form";

export const metadata = {
  title: "Edit Product | Auro Ardon Admin",
  robots: { index: false, follow: false },
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let product: Product | null = null;
  let categories: Category[] = [];

  try {
    const supabase = createAdminSupabaseClient();
    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();
    if (!productError && productData) product = productData as Product;

    const { data: categoryData, error: categoryError } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
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
    <section className="min-w-0 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-luxe backdrop-blur sm:rounded-[2rem] sm:p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">
          Inventory
        </p>
        <h2 className="font-serif text-3xl text-ink">Edit jewelry piece</h2>
        <p className="mt-2 text-sm text-muted">
          Update details, images, and availability.
        </p>
      </div>
      <ProductForm initialProduct={product} categories={categories} />
    </section>
  );
}
