import Image from "next/image";
import Link from "next/link";

import { DEFAULT_PRODUCT_BLUR_DATA_URL } from "@/components/storefront/price-kes";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { ProductTile } from "@/components/storefront/product-tile";
import {
  getSafeCatalogImageUrl,
  selectHomepageBestsellers
} from "@/lib/catalog";
import {
  listCategories,
  listCategoryRepresentatives,
  listFeaturedProducts,
  listPublicProducts
} from "@/lib/data";

export const revalidate = 300;

export const metadata = {
  title: "Auro Ardon | Gold-tone jewelry in Nairobi",
  description:
    "Gold-tone jewelry, delivered in Nairobi today. Tarnish-free stainless pieces from KES 800. Pay on delivery or order on WhatsApp."
};

export default async function HomePage() {
  const [allProducts, featuredProducts, categories, representatives] =
    await Promise.all([
      listPublicProducts(),
      listFeaturedProducts(6),
      listCategories(),
      listCategoryRepresentatives()
    ]);

  const newInProducts = allProducts.slice(0, 8);
  const bestsellers = selectHomepageBestsellers(
    allProducts,
    categories,
    newInProducts
  );

  const heroProduct = featuredProducts[0] ?? allProducts[0];
  const heroImage =
    getSafeCatalogImageUrl(heroProduct?.images[0]) || "/hero-jewelry.png";

  const representativeMap = new Map(
    representatives.map(item => [item.category_id, item.image_url])
  );
  const visibleCategories = categories.slice(0, 6);

  return (
    <div className="bg-paper text-text">
      <section className="relative h-[70vh] min-h-[440px] w-full overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 animate-hero-reveal">
          <Image
            src={heroImage}
            alt="Auro Ardon gold-tone jewelry"
            fill
            priority
            placeholder="blur"
            blurDataURL={
              heroProduct?.blur_data_url || DEFAULT_PRODUCT_BLUR_DATA_URL
            }
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-ink/50" />
        </div>

        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-10 sm:px-6 lg:px-10 lg:pb-14">
          <h1 className="max-w-4xl font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-white md:text-[72px] lg:text-[84px]">
            Gold-tone jewelry, delivered in Nairobi today.
          </h1>
          <p className="mt-4 max-w-xl font-sans text-[16px] leading-[1.5] text-white/90">
            Tarnish-free stainless pieces from KES 800. Pay on delivery or order on WhatsApp.
          </p>
          <div className="mt-6">
            <Link href="/shop?sort=newest" className="btn-primary">
              Shop new in
            </Link>
          </div>
        </div>
      </section>

      {visibleCategories.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
          <h2 className="mb-6 font-serif text-[32px] font-normal leading-[1.0] tracking-[-0.01em] text-text">
            Shop by category
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {visibleCategories.map(category => {
              const image =
                getSafeCatalogImageUrl(category.image_url) ||
                getSafeCatalogImageUrl(representativeMap.get(category.id)) ||
                "/hero-jewelry.png";
              return (
                <Link
                  key={category.id}
                  href={`/shop/${category.slug}`}
                  className="group block"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-none bg-paper">
                    <Image
                      src={image}
                      alt={category.name}
                      fill
                      loading="lazy"
                      placeholder="blur"
                      blurDataURL={DEFAULT_PRODUCT_BLUR_DATA_URL}
                      sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 16vw"
                      className="object-cover object-center"
                    />
                  </div>
                  <p className="mt-2 font-sans text-[14px] leading-[1.5] text-text group-hover:text-brass">
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
            <h2 className="font-serif text-[32px] font-normal leading-[1.0] tracking-[-0.01em] text-text">
              New in
            </h2>
            <Link
              href="/shop?sort=newest"
              className="font-sans text-[14px] leading-[1.5] text-text underline underline-offset-4 hover:text-brass"
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
            Auro Ardon is a Nairobi jewelry house. We pick bold, giftable, tarnish-free pieces, deliver across Nairobi in a day, and you pay when it arrives.
          </p>
          <div className="mt-6 flex flex-col gap-2 font-sans text-[14px] leading-[1.5] text-white/80 sm:flex-row sm:flex-wrap sm:gap-8">
            <span>Same-day Nairobi delivery</span>
            <span>Pay on delivery (cash or M-Pesa)</span>
            <span>Order or ask on WhatsApp</span>
          </div>
        </div>
      </section>

      {bestsellers.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-[32px] font-normal leading-[1.0] tracking-[-0.01em] text-text">
              Gift sets and bestsellers
            </h2>
            <Link
              href="/shop"
              className="font-sans text-[14px] leading-[1.5] text-text underline underline-offset-4 hover:text-brass"
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
