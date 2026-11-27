import Image from "next/image";
import Link from "next/link";

import { DEFAULT_PRODUCT_BLUR_DATA_URL } from "@/components/storefront/price-kes";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { ProductTile } from "@/components/storefront/product-tile";
import {
  filterNonEmptyCategories,
  getCategoryGridClassName,
  getCategoryTileAspectClassName,
  getCategoryTileSizes,
  getSafeCatalogImageUrl,
  selectHomepageBestsellers
} from "@/lib/catalog";
import {
  deriveCategoryRepresentatives,
  getStoreSettings,
  listCategories,
  listPublicProducts
} from "@/lib/data";
import { resolveProductImageAlt } from "@/lib/image-processing";
import {
  buildOrganizationJsonLd,
  buildPageMetadata,
  serializeJsonLd
} from "@/lib/seo";
import { formatHeroSubline, HERO_CONFIG, SITE_CONFIG } from "@/lib/site-config";

export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: `${SITE_CONFIG.brandName} | ${SITE_CONFIG.heroHeadline}`,
  description: `${SITE_CONFIG.heroHeadline} ${SITE_CONFIG.brandLine}`,
  pathname: "/",
  absoluteTitle: true
});

export default async function HomePage() {
  const [allProducts, categories, storeSettings] = await Promise.all([
    listPublicProducts(),
    listCategories(),
    getStoreSettings()
  ]);

  const activeCategories = filterNonEmptyCategories(categories, allProducts);
  const featuredProducts = [...allProducts]
    .filter(product => product.is_featured)
    .sort(
      (a, b) =>
        (a.featured_order ?? 0) - (b.featured_order ?? 0) ||
        b.created_at.localeCompare(a.created_at)
    )
    .slice(0, 6);
  const representatives = deriveCategoryRepresentatives(allProducts);
  const pinnedNewIn = [...allProducts]
    .filter(product => product.is_new_in)
    .sort(
      (a, b) =>
        (a.new_in_order ?? 0) - (b.new_in_order ?? 0) ||
        b.created_at.localeCompare(a.created_at)
    );
  const pinnedNewInIds = new Set(pinnedNewIn.map(product => product.id));
  const newInProducts = [
    ...pinnedNewIn,
    ...allProducts.filter(product => !pinnedNewInIds.has(product.id))
  ].slice(0, 8);
  const bestsellers = selectHomepageBestsellers(
    allProducts,
    activeCategories,
    newInProducts
  );

  const heroProduct = featuredProducts[0] ?? allProducts[0];
  const heroImage =
    HERO_CONFIG.imageUrl ||
    getSafeCatalogImageUrl(heroProduct?.images[0]) ||
    "/hero-jewelry.png";
  const heroAlt = heroProduct
    ? resolveProductImageAlt(heroProduct, 0)
    : "Curated jewelry, watches, and beauty picks";
  const heroSubline = formatHeroSubline(allProducts);

  const representativeMap = new Map(
    representatives.map(item => [item.category_id, item.image_url])
  );
  const productCountByCategory = new Map<string, number>();
  for (const product of allProducts) {
    if (product.category_id) {
      productCountByCategory.set(
        product.category_id,
        (productCountByCategory.get(product.category_id) ?? 0) + 1
      );
    }
  }

  const visibleCategories = activeCategories.slice(0, 6);
  const usedTileImages = new Set<string>();
  const organizationJsonLd = buildOrganizationJsonLd(storeSettings);

  return (
    <div className="bg-paper text-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(organizationJsonLd)
        }}
      />

      <section className="relative flex min-h-[500px] w-full items-end overflow-hidden bg-ink text-white sm:min-h-[540px] md:items-center lg:min-h-[600px]">
        <div className="absolute inset-0 animate-hero-reveal md:left-[28%] lg:left-[34%]">
          <Image
            src={heroImage}
            alt={heroAlt}
            fill
            priority
            placeholder="blur"
            blurDataURL={
              heroProduct?.blur_data_url || DEFAULT_PRODUCT_BLUR_DATA_URL
            }
            sizes="(max-width: 767px) 100vw, 72vw"
            className={`object-cover ${HERO_CONFIG.focalPointClass}`}
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/15 md:bg-gradient-to-r md:from-ink md:via-ink/75 md:to-ink/10"
        />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-10 pt-44 sm:px-6 sm:pb-12 sm:pt-48 md:py-20 lg:px-10">
          <h1 className="hero-headline font-serif font-normal text-white">
            {HERO_CONFIG.headline}
          </h1>
          <p className="mt-4 max-w-md font-sans text-[15px] leading-[1.5] text-white/90 sm:text-[16px]">
            {heroSubline}
          </p>
          <div className="mt-6">
            <Link href={HERO_CONFIG.ctaHref} className="btn-primary">
              {HERO_CONFIG.ctaLabel}
            </Link>
          </div>
        </div>
      </section>

      {visibleCategories.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
          <h2 className="mb-6 font-serif text-[32px] font-normal leading-[1.12] tracking-[-0.01em] text-text">
            Shop by category
          </h2>
          <div
            className={`grid gap-4 ${getCategoryGridClassName(visibleCategories.length)}`}
          >
            {visibleCategories.map(category => {
              const candidateImage =
                getSafeCatalogImageUrl(category.image_url) ||
                getSafeCatalogImageUrl(representativeMap.get(category.id));
              const distinctImage =
                candidateImage && !usedTileImages.has(candidateImage)
                  ? candidateImage
                  : null;
              if (distinctImage) {
                usedTileImages.add(distinctImage);
              }
              const count = productCountByCategory.get(category.id) ?? 0;

              return (
                <Link
                  key={category.id}
                  href={`/shop/${category.slug}`}
                  className="group block"
                >
                  <div
                    className={`relative w-full overflow-hidden rounded-none border border-text/10 bg-stone ${getCategoryTileAspectClassName(visibleCategories.length)}`}
                  >
                    {distinctImage ? (
                      <Image
                        src={distinctImage}
                        alt={`${category.name} collection`}
                        fill
                        loading="lazy"
                        placeholder="blur"
                        blurDataURL={DEFAULT_PRODUCT_BLUR_DATA_URL}
                        sizes={getCategoryTileSizes(visibleCategories.length)}
                        className="object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                        <span className="font-serif text-[28px] leading-[1.1] tracking-[-0.01em] text-[#7A5D1D] dark:text-price">
                          {category.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="mt-2 font-sans text-[12px] text-muted">
                          {count === 1 ? "1 piece" : `${count} pieces`}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 font-sans text-[14px] leading-[1.5] text-text group-hover:text-price">
                    {category.name}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {newInProducts.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-[32px] font-normal leading-[1.12] tracking-[-0.01em] text-text">
              New in
            </h2>
            <Link
              href="/shop?sort=newest"
              className="font-sans text-[14px] leading-[1.5] text-text underline underline-offset-4 hover:text-price"
            >
              See all
            </Link>
          </div>

          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
            {newInProducts.map((product, index) => (
              <div
                key={product.id}
                className="w-[210px] shrink-0 sm:w-[250px]"
              >
                <ProductTile
                  product={product}
                  priority={index < 4}
                  sizes="250px"
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="bg-ink text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
          <p className="max-w-4xl font-serif text-[32px] font-normal leading-[1.15] tracking-[-0.01em] text-white md:text-[40px]">
            {SITE_CONFIG.brandLine}
          </p>
          <div className="mt-6 flex flex-col gap-2 font-sans text-[14px] leading-[1.5] text-white/80 sm:flex-row sm:flex-wrap sm:gap-8">
            {SITE_CONFIG.statementFacts.map(fact => (
              <span key={fact}>{fact}</span>
            ))}
          </div>
        </div>
      </section>

      {bestsellers.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-[32px] font-normal leading-[1.12] tracking-[-0.01em] text-text">
              Gift sets and bestsellers
            </h2>
            <Link
              href="/shop"
              className="font-sans text-[14px] leading-[1.5] text-text underline underline-offset-4 hover:text-price"
            >
              See all
            </Link>
          </div>
          <ProductGallery products={bestsellers} columns={3} />
        </section>
      ) : null}
    </div>
  );
}
