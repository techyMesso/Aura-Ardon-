import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ProductForm } from "@/components/admin/product-form";

export const metadata = {
  title: "Add New Product | Auro Ardon Admin",
  robots: { index: false, follow: false },
};

export default function NewProductPage() {
  return (
    <section className="rounded-[2rem] border border-white/60 bg-white/70 p-4 sm:p-6 shadow-luxe backdrop-blur">
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
      <ProductForm />
    </section>
  );
}
