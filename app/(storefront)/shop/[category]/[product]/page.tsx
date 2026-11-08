import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { ProductGallery } from "@/components/storefront/product-gallery";
import {
  createCategoryMap,
  getCanonicalProductPath,
  getSafeCatalogImageUrl,
  resolveProductCategory
} from "@/lib/catalog";
import {
  getProductBySlug,
  listCategories,
  listProductsByCategory,
  listPublicProducts
} from "@/lib/data";
import { getOptionalSiteUrl } from "@/lib/env";
import { ProductDetailClient } from "./product-detail-client";

interface ProductPageProps {
  params: Promise<{ category: string; product: string }>;
}

export const revalidate = 300;

export async function generateStaticParams() {
  const [categories, products] = await Promise.all([
    listCategories(),
    listPublicProducts()
  ]);
  const categoryMap = createCategoryMap(categories);

  return products.flatMap(product => {
    const category = resolveProductCategory(product, categoryMap);
    if (!category) return [];
    return [{ category: category.slug, product: product.slug || product.id }];
  });
}

export async function generateMetadata({
  params
}: ProductPageProps): Promise<Metadata> {
  const { category: categorySlug, product: productSlug } = await params;
  const [product, categories] = await Promise.all([
    getProductBySlug(productSlug),
    listCategories()
  ]);
  if (!product) return { title: "Product not found" };

  const categoryMap = createCategoryMap(categories);
  const category = resolveProductCategory(product, categoryMap);
  const productPath = getCanonicalProductPath(product, categoryMap);
  if (!category || !productPath || category.slug !== categorySlug) {
    return { title: "Product not found" };
  }

  const siteUrl = getOptionalSiteUrl();
  const canonicalUrl = siteUrl ? `${siteUrl}${productPath}` : null;
  const description =
    product.description.trim().slice(0, 160) ||
    `${product.title} from Auro Ardon in Nairobi.`;

  return {
    title: product.title,
    description,
    alternates: canonicalUrl ? { canonical: canonicalUrl } : undefined,
    openGraph: {
      type: "website",
      title: product.title,
      description,
      url: canonicalUrl ?? undefined
    }
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { category: categorySlug, product: productSlug } = await params;
  const [product, categories] = await Promise.all([
    getProductBySlug(productSlug),
    listCategories()
  ]);
  if (!product) notFound();

  const categoryMap = createCategoryMap(categories);
  const category = resolveProductCategory(product, categoryMap);
  const canonicalPath = getCanonicalProductPath(product, categoryMap);
  if (!category || !canonicalPath) notFound();
  const requestedPath = `/shop/${categorySlug}/${productSlug}`;
  if (requestedPath !== canonicalPath) permanentRedirect(canonicalPath);

  const relatedProducts = (await listProductsByCategory(category.slug))
    .filter(related => related.id !== product.id)
    .slice(0, 4);
  const siteUrl = getOptionalSiteUrl();
  const productUrl = siteUrl ? `${siteUrl}${canonicalPath}` : null;
  const safeProductImages = product.images
    .map(getSafeCatalogImageUrl)
    .filter((image): image is string => Boolean(image));
  const structuredImage = safeProductImages.length
    ? safeProductImages
    : siteUrl
      ? [`${siteUrl}/hero-jewelry.png`]
      : [];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    sku: product.id,
    ...(structuredImage.length ? { image: structuredImage } : {}),
    ...(product.material ? { material: product.material } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "KES",
      price: Number(product.price).toFixed(2),
      availability:
        product.stock_quantity > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      ...(productUrl ? { url: productUrl } : {})
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c")
        }}
      />
      <ProductDetailClient
        product={product}
        category={category}
        productUrl={productUrl}
        whatsappNumber={process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? null}
      />
      {relatedProducts.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6 lg:px-10">
          <h2 className="mb-6 font-serif text-[32px] font-normal leading-[1.0] tracking-[-0.01em] text-text">
            Wear it with
          </h2>
          <ProductGallery products={relatedProducts} columns={4} />
        </section>
      ) : null}
    </>
  );
}
