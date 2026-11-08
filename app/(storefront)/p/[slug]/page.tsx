import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { ProductGallery } from "@/components/storefront/product-gallery";
import {
  createCategoryMap,
  formatProductTitle,
  getSafeCatalogImageUrl,
  productHref,
  resolveProductCategory
} from "@/lib/catalog";
import {
  getProductBySlug,
  listCategories,
  listProductsByCategory,
  listPublicProducts
} from "@/lib/data";
import { getOptionalSiteUrl } from "@/lib/env";
import { ProductDetailClient } from "@/app/(storefront)/shop/[category]/[product]/product-detail-client";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = 300;

export async function generateStaticParams() {
  const products = await listPublicProducts();
  return products.map(product => ({
    slug: (product.slug || product.id).trim()
  }));
}

export async function generateMetadata({
  params
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(decodeURIComponent(slug));
  if (!product) return { title: "Product not found" };

  const displayTitle = formatProductTitle(product.title);
  const canonicalPath = productHref(product);
  const siteUrl = getOptionalSiteUrl();
  const canonicalUrl = siteUrl ? `${siteUrl}${canonicalPath}` : null;
  const description =
    product.description.trim().slice(0, 160) ||
    `${displayTitle} from Auro Ardon in Nairobi.`;

  return {
    title: displayTitle,
    description,
    alternates: canonicalUrl ? { canonical: canonicalUrl } : undefined,
    openGraph: {
      type: "website",
      title: displayTitle,
      description,
      url: canonicalUrl ?? undefined
    }
  };
}

export default async function CanonicalProductPage({
  params
}: ProductPageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const [product, categories] = await Promise.all([
    getProductBySlug(decodedSlug),
    listCategories()
  ]);
  if (!product) notFound();

  const canonicalPath = productHref(product);
  const requestedPath = `/p/${encodeURIComponent(decodedSlug)}`;
  if (requestedPath !== canonicalPath) {
    permanentRedirect(canonicalPath);
  }

  const categoryMap = createCategoryMap(categories);
  const category = resolveProductCategory(product, categoryMap);

  const candidateRelated = category
    ? await listProductsByCategory(category.slug)
    : await listPublicProducts();
  const relatedProducts = candidateRelated
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
    name: formatProductTitle(product.title),
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
