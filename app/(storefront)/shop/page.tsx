import { CollectionShell } from "@/components/storefront/collection-shell";
import { ShopPageClient } from "@/components/storefront/shop-page-client";
import { listCategories, listPublicProducts } from "@/lib/data";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "Shop All Products",
  description:
    "Browse Auro Ardon jewelry, watches, beauty picks, and giftable pieces delivered across Nairobi.",
  pathname: "/shop"
});

export default async function ShopPage() {
  const [products, categories] = await Promise.all([
    listPublicProducts(),
    listCategories()
  ]);

  return (
    <CollectionShell categories={categories}>
      <ShopPageClient products={products} />
    </CollectionShell>
  );
}
