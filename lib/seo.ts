import type { Metadata } from "next";

import { formatProductTitle, getSafeCatalogImageUrl } from "@/lib/catalog";
import {
  CURRENCY,
  SITE_NAME,
  buildCanonicalUrl,
  resolveSiteUrl
} from "@/lib/site";
import type { Category, Product, StoreSettings } from "@/lib/types";
import { formatWhatsAppNumber } from "@/lib/utils";

export interface PageMetadataInput {
  title: string;
  description: string;
  pathname: string;
  absoluteTitle?: boolean;
  noIndex?: boolean;
  openGraphType?: "website" | "article";
}

export function buildPageMetadata({
  title,
  description,
  pathname,
  absoluteTitle = false,
  noIndex = false,
  openGraphType = "website"
}: PageMetadataInput): Metadata {
  const canonicalUrl = buildCanonicalUrl(pathname);
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: canonicalUrl
    },
    ...(noIndex
      ? {
          robots: {
            index: false,
            follow: false
          }
        }
      : {}),
    openGraph: {
      type: openGraphType,
      locale: "en_KE",
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      url: canonicalUrl
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description
    }
  };
}

/**
 * Generates a deterministic, human-readable SKU (never a raw UUID).
 * Example: AA-WAT-CLASSIC-8591
 */
export function buildReadableSku(
  product: Pick<Product, "id" | "slug" | "title" | "category">,
  category?: Pick<Category, "slug" | "name"> | null
): string {
  const categorySource = (category?.slug || product.category || "GEN")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, "X");

  const nameSource = (product.slug || product.title || "ITEM")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 12)
    .replace(/-+$/, "");

  const shortSuffix = product.id.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();

  return `AA-${categorySource}-${nameSource || "ITEM"}-${shortSuffix || "0001"}`;
}

export interface BreadcrumbItem {
  name: string;
  pathname: string;
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  const siteUrl = resolveSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: buildCanonicalUrl(item.pathname, siteUrl)
    }))
  };
}

export function buildOrganizationJsonLd(settings: StoreSettings) {
  const siteUrl = resolveSiteUrl();
  const formattedPhone = formatWhatsAppNumber(
    settings.business_phone || settings.whatsapp_number
  );
  const logoUrl =
    getSafeCatalogImageUrl(settings.logo_url) || buildCanonicalUrl("/apple-icon", siteUrl);
  const sameAs = [settings.instagram_url, settings.tiktok_url]
    .map(url => url.trim())
    .filter(url => /^https?:\/\//i.test(url));

  const sharedContact = {
    ...(formattedPhone ? { telephone: formattedPhone } : {}),
    ...(settings.business_email ? { email: settings.business_email } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {})
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: settings.site_name || SITE_NAME,
        url: siteUrl,
        logo: logoUrl,
        ...sharedContact
      },
      {
        "@type": "LocalBusiness",
        "@id": `${siteUrl}/#localbusiness`,
        name: settings.site_name || SITE_NAME,
        url: siteUrl,
        image: buildCanonicalUrl("/opengraph-image", siteUrl),
        priceRange: CURRENCY,
        address: {
          "@type": "PostalAddress",
          addressLocality: "Nairobi",
          addressRegion: "Nairobi",
          addressCountry: "KE",
          ...(settings.business_address
            ? { streetAddress: settings.business_address }
            : {})
        },
        openingHours: "Mo-Sa 09:00-19:00",
        areaServed: {
          "@type": "Country",
          name: "Kenya"
        },
        ...sharedContact
      }
    ]
  };
}

export interface ProductReviewAggregate {
  ratingValue: number;
  reviewCount: number;
}

export function buildProductJsonLd({
  product,
  category,
  productUrl,
  reviewStats
}: {
  product: Product;
  category: Category | null;
  productUrl: string;
  reviewStats?: ProductReviewAggregate | null;
}) {
  const siteUrl = resolveSiteUrl();
  const safeProductImages = product.images
    .map(getSafeCatalogImageUrl)
    .filter((image): image is string => Boolean(image));
  const absoluteImages =
    safeProductImages.length > 0
      ? safeProductImages
      : [buildCanonicalUrl("/hero-jewelry.png", siteUrl)];

  const includeRating =
    reviewStats &&
    Number.isFinite(reviewStats.ratingValue) &&
    reviewStats.reviewCount > 0;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: formatProductTitle(product.title),
    description: product.description,
    sku: buildReadableSku(product, category),
    brand: {
      "@type": "Brand",
      name: SITE_NAME
    },
    image: absoluteImages,
    ...(category?.name ? { category: category.name } : {}),
    ...(product.material ? { material: product.material } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: CURRENCY,
      price: Number(product.price).toFixed(2),
      availability:
        product.stock_quantity > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: productUrl
    },
    ...(includeRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(reviewStats.ratingValue.toFixed(2)),
            reviewCount: reviewStats.reviewCount
          }
        }
      : {})
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function buildFaqJsonLd(items: readonly FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(item => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

