import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { listCategories } from "@/lib/data";

export const metadata = {
  title: "Shop All | Auro Ardon",
  description: "Browse premium jewelry and accessories from Auro Ardon.",
};

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await listCategories();

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-5 py-10 md:px-6 lg:px-10 lg:py-12">
        <header className="mb-10 overflow-hidden rounded-[1.75rem] bg-[#111111] px-6 py-10 text-center text-white shadow-luxe">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c49d52]">Collections</p>
          <h1 className="mt-3 font-serif text-5xl leading-tight sm:text-6xl">Premium pieces, easy ordering</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/72">
            Explore elegant jewelry and accessories designed for stylish everyday wear, gifting, and standout moments.
          </p>
        </header>

        <nav className="mb-12 flex flex-wrap justify-center gap-3">
          <Link
            href="/shop"
            className="btn-ghost border border-border/40 bg-white/70"
          >
            All Products
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/shop/${cat.slug}`}
              className="btn-ghost border border-border/40 bg-white/70"
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
