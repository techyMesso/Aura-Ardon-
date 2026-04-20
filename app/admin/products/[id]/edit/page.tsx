import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";
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

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();
    if (!error && data) {
      product = data as Product;
    }
  } catch (error) {
    console.error("Failed to fetch product:", error);
  }

  if (!product) notFound();

  return (
    <section className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-luxe backdrop-blur">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">
          Inventory
        </p>
        <h2 className="font-serif text-3xl text-ink">Edit jewelry piece</h2>
        <p className="mt-2 text-sm text-muted">
          Update details, images, and availability.
        </p>
      </div>
      <ProductForm initialProduct={product} />
    </section>
  );
}
