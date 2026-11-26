import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { ProductDetailClient } from "@/components/storefront/product-detail-client";
import { ProductGallery } from "@/components/storefront/product-gallery";
import {
  createCategoryMap,
  formatProductTitle,
  productHref,
  resolveProductCategory
} from "@/lib/catalog";
import {
  getActiveRedirect,
  getProductBySlug,
  listCategories,
  listProductsByCategory,
  listPublicProducts
} from "@/lib/data";
import {
  buildBreadcrumbJsonLd,
  buildPageMetadata,
  buildProductJsonLd,
  serializeJsonLd
} from "@/lib/seo";
import { buildCanonicalUrl } from "@/lib/site";

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
  const decodedSlug = decodeURIComponent(slug);
  const product = await getProductBySlug(decodedSlug);
  if (!product) {
    return buildPageMetadata({
      title: "Product Not Found",
      description: "The requested Auro Ardon piece could not be found.",
      pathname: `/p/${encodeURIComponent(decodedSlug)}`,
      noIndex: true
    });
  }

  const displayTitle = formatProductTitle(product.title);
  const canonicalPath = productHref(product);
  const description =
    product.description.trim().slice(0, 160) ||
    `${displayTitle} from Auro Ardon in Nairobi.`;

  return buildPageMetadata({
    title: displayTitle,
    description,
    pathname: canonicalPath
  });
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
  if (!product) {
    const redirectMatch = await getActiveRedirect(`/p/${decodedSlug}`);
    if (redirectMatch) {
      permanentRedirect(redirectMatch.to_path);
    }
    notFound();
  }

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

  const productUrl = buildCanonicalUrl(canonicalPath);
  const productJsonLd = buildProductJsonLd({
    product,
    category,
    productUrl
  });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", pathname: "/" },
    { name: "Shop", pathname: "/shop" },
    ...(category
      ? [{ name: category.name, pathname: `/shop/${category.slug}` }]
      : []),
    { name: formatProductTitle(product.title), pathname: canonicalPath }
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(productJsonLd)
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(breadcrumbJsonLd)
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
