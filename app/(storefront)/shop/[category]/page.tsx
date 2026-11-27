import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { CollectionShell } from "@/components/storefront/collection-shell";
import { ShopPageClient } from "@/components/storefront/shop-page-client";
import {
  getActiveRedirect,
  getStoreSettings,
  listCategories,
  listProductsByCategory
} from "@/lib/data";
import {
  buildBreadcrumbJsonLd,
  buildPageMetadata,
  serializeJsonLd
} from "@/lib/seo";

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export const revalidate = 300;

export async function generateStaticParams() {
  const categories = await listCategories();
  return categories.map(cat => ({ category: cat.slug }));
}

export async function generateMetadata({
  params
}: CategoryPageProps): Promise<Metadata> {
  const { category: slug } = await params;
  const categories = await listCategories();
  const category = categories.find(c => c.slug === slug);

  if (!category) {
    return buildPageMetadata({
      title: "Category Not Found",
      description: "The requested Auro Ardon collection could not be found.",
      pathname: `/shop/${encodeURIComponent(slug)}`,
      noIndex: true
    });
  }

  const products = await listProductsByCategory(slug);

  return buildPageMetadata({
    title: category.name,
    description:
      category.description ||
      `Shop our ${category.name} collection from Auro Ardon in Nairobi with same-day delivery and payment on arrival.`,
    pathname: `/shop/${category.slug}`,
    noIndex: products.length === 0
  });
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category: slug } = await params;
  const categories = await listCategories();
  const category = categories.find(record => record.slug === slug);

  if (!category) {
    const redirectMatch = await getActiveRedirect(`/shop/${slug}`);
    if (redirectMatch) {
      permanentRedirect(redirectMatch.to_path);
    }
    notFound();
  }

  const [products, storeSettings] = await Promise.all([
    listProductsByCategory(slug),
    getStoreSettings()
  ]);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", pathname: "/" },
    { name: "Shop", pathname: "/shop" },
    { name: category.name, pathname: `/shop/${category.slug}` }
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(breadcrumbJsonLd)
        }}
      />
      <CollectionShell categories={categories} activeCategory={category}>
        <ShopPageClient
          products={products}
          emptyCategoryName={category.name}
          whatsappNumber={storeSettings.whatsapp_number}
        />
      </CollectionShell>
    </>
  );
}
