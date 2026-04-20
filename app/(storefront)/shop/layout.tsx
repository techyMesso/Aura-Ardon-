import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { listCategories } from "@/lib/data";

export const metadata = {
  title: "Shop All | Auro Ardon",
  description: "Browse our complete collection of handcrafted jewelry, lip care, and hair accessories.",
};

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await listCategories();

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <header className="mb-10 text-center">
          <p className="section-label">Collections</p>
          <h1 className="heading-display mt-3">Shop All</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted">
            Explore our complete collection of handcrafted jewelry, nourishing lip care, and elegant hair accessories.
          </p>
        </header>

        <nav className="mb-12 flex flex-wrap justify-center gap-3">
          <Link
            href="/shop"
            className="btn-ghost bg-white/60 border border-border/40"
          >
            All Products
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/shop/${cat.slug}`}
              className="btn-ghost bg-white/60 border border-border/40"
            >
              {cat.name}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </div>
  );
}