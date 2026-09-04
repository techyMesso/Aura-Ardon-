import { Suspense } from "react";

import { CollectionShell } from "@/components/storefront/collection-shell";
import { ShopPageClient } from "@/components/storefront/shop-page-client";
import { listCategories, listPublicProducts } from "@/lib/data";

export const metadata = {
  title: "Shop All Products | Auro Ardon",
  description: "Browse Auro Ardon jewelry, accessories, and giftable pieces from Nairobi.",
};

export default async function ShopPage() {
  const [products, categories] = await Promise.all([
    listPublicProducts(),
    listCategories()
  ]);

  return (
    <CollectionShell categories={categories}>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-[2rem] bg-white/60" />}>
        <ShopPageClient products={products} />
      </Suspense>
    </CollectionShell>
  );
}
