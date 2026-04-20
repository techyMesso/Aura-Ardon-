import { ProductForm } from "@/components/admin/product-form";

export const metadata = {
  title: "Add New Product | Auro Ardon Admin",
  robots: { index: false, follow: false },
};

export default function NewProductPage() {
  return (
    <section className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-luxe backdrop-blur">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">
          Inventory
        </p>
        <h2 className="font-serif text-3xl text-ink">Add new jewelry piece</h2>
        <p className="mt-2 text-sm text-muted">
          Create a new listing with images, price, and stock details.
        </p>
      </div>
      <ProductForm />
    </section>
  );
}
