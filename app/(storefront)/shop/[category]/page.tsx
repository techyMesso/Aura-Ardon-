import { notFound } from "next/navigation";
import { Suspense } from "react";

import { listCategories, listProductsByCategory } from "@/lib/data";
import { CollectionShell } from "@/components/storefront/collection-shell";
import { ShopPageClient } from "@/components/storefront/shop-page-client";

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  const categories = await listCategories();
  return categories.map((cat) => ({ category: cat.slug }));
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const { category: slug } = await params;
  const categories = await listCategories();
  const category = categories.find((c) => c.slug === slug);

  if (!category) {
    return { title: "Category Not Found" };
  }

  return {
    title: `${category.name} | Auro Ardon Shop`,
    description: category.description || `Shop our ${category.name} collection - handcrafted ${category.name.toLowerCase()} from Nairobi.`,
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category: slug } = await params;
  const categories = await listCategories();
  const category = categories.find((record) => record.slug === slug);

  if (!category) {
    notFound();
  }

  const products = await listProductsByCategory(slug);

  return (
    <CollectionShell categories={categories} activeCategory={category}>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-[2rem] bg-white/60" />}>
        <ShopPageClient products={products} />
      </Suspense>
    </CollectionShell>
  );
}
