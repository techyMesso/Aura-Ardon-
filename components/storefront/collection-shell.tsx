import Image from "next/image";
import Link from "next/link";

import { getSafeCatalogImageUrl } from "@/lib/catalog";
import type { Category } from "@/lib/types";

interface CollectionShellProps {
  categories: Category[];
  activeCategory?: Category;
  children: React.ReactNode;
}

export function CollectionShell({
  categories,
  activeCategory,
  children
}: CollectionShellProps) {
  const categoryImage = getSafeCatalogImageUrl(activeCategory?.image_url);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-6 lg:px-10 lg:py-12">
        <header className="relative mb-6 overflow-hidden rounded-[1.75rem] bg-[#111111] px-6 py-10 text-center text-white shadow-luxe sm:py-12">
          {categoryImage ? (
            <>
              <Image
                src={categoryImage}
                alt=""
                fill
                priority
                sizes="(max-width: 1280px) 100vw, 1280px"
                className="object-cover opacity-35"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#111111]/95 via-[#111111]/78 to-[#111111]/88" />
            </>
          ) : null}
          <div className="relative mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c49d52]">
              {activeCategory ? "Collection" : "Auro Ardon collections"}
            </p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-white sm:text-6xl">
              {activeCategory?.name ?? "Pieces made for a bold entrance"}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/72 sm:text-base">
              {activeCategory?.description
                ?? "Explore jewelry, accessories, and giftable pieces selected for everyday confidence and standout moments."}
            </p>
          </div>
        </header>

        <nav
          className="no-scrollbar -mx-5 mb-6 flex snap-x gap-2 overflow-x-auto px-5 pb-2 md:-mx-6 md:px-6 lg:-mx-10 lg:px-10"
          aria-label="Shop collections"
        >
          <Link
            href="/shop"
            aria-current={!activeCategory ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 snap-start items-center justify-center rounded-full border px-5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
              !activeCategory
                ? "border-ink bg-ink text-white"
                : "border-border bg-white/75 text-muted hover:border-bronze hover:text-ink"
            }`}
          >
            All Products
          </Link>
          {categories.map(category => {
            const active = activeCategory?.id === category.id;
            return (
              <Link
                key={category.id}
                href={`/shop/${category.slug}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 snap-start items-center justify-center rounded-full border px-5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-border bg-white/75 text-muted hover:border-bronze hover:text-ink"
                }`}
              >
                {category.name}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
