import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CreditCard,
  MapPin,
  MessageCircle,
  PackageCheck,
  ShoppingBag,
  Truck
} from "lucide-react";

import { ProductGallery } from "@/components/storefront/product-gallery";
import {
  createCategoryMap,
  getCanonicalProductPath,
  getSafeCatalogImageUrl
} from "@/lib/catalog";
import {
  listCategories,
  listCategoryRepresentatives,
  listFeaturedProducts
} from "@/lib/data";
import { createWhatsAppLink, formatCurrency } from "@/lib/utils";

export const metadata = {
  title: "Auro Ardon | Jewelry for Bold Women",
  description:
    "Shop jewelry and accessories from Auro Ardon in Nairobi. Checkout online or order with WhatsApp support."
};

export default async function HomePage() {
  const [featuredProducts, categories, representatives] = await Promise.all([
    listFeaturedProducts(8),
    listCategories(),
    listCategoryRepresentatives()
  ]);
  const categoryMap = createCategoryMap(categories);
  const heroProduct = featuredProducts.find(product =>
    Boolean(getCanonicalProductPath(product, categoryMap))
  );
  const heroProductPath = heroProduct
    ? getCanonicalProductPath(heroProduct, categoryMap)
    : null;
  const heroProductImage = getSafeCatalogImageUrl(heroProduct?.images[0]);
  const representativeMap = new Map(
    representatives.map(item => [item.category_id, item.image_url])
  );
  const whatsappUrl = createWhatsAppLink(
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
    "Hello Auro Ardon, I would like help choosing a piece."
  );

  return (
    <div className="overflow-x-hidden">
      <section className="border-b border-white/10 bg-[#111111] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 md:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-10 lg:py-16">
          <div className="flex flex-col justify-center">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c49d52]">
              Nairobi jewelry house
            </p>
            <h1 className="mt-4 max-w-2xl font-serif text-5xl leading-[0.98] text-white sm:text-6xl lg:text-7xl">
              Bold pieces. Your signature finish.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/72 sm:text-lg">
              Jewelry and accessories selected for women who dress with intent, gift beautifully, and never disappear into the room.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/shop" className="btn-primary min-h-12 bg-[#c49d52] px-7 text-[#111111] hover:bg-[#d4a843]">
                Shop Now
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline min-h-12 border-white/20 bg-white/5 px-7 text-white hover:bg-white/10 hover:text-white"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  WhatsApp
                </a>
              ) : null}
            </div>
          </div>

          <div className="relative min-h-[430px] sm:min-h-[560px]">
            <div className="absolute inset-4 rounded-[2rem] border border-[#c49d52]/25 sm:inset-8" />
            <div className="absolute inset-y-0 left-0 w-[76%] overflow-hidden rounded-[2rem] bg-[#1c1c1c] shadow-[0_40px_90px_rgba(0,0,0,0.38)]">
              <Image
                src={heroProductImage || "/hero-jewelry.png"}
                alt={heroProduct ? `${heroProduct.title} by Auro Ardon` : "Auro Ardon jewelry styling"}
                fill
                priority
                sizes="(max-width: 1024px) 76vw, 40vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            </div>

            {heroProduct && heroProductPath ? (
              <Link
                href={heroProductPath}
                className="absolute bottom-5 right-0 w-[70%] rounded-[1.5rem] border border-white/10 bg-[#191919]/92 p-5 text-white shadow-2xl backdrop-blur transition hover:-translate-y-1 sm:bottom-10 sm:w-[58%]"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#c49d52]">Featured piece</p>
                <h2 className="mt-2 font-serif text-2xl leading-tight sm:text-3xl">{heroProduct.title}</h2>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white/88">{formatCurrency(heroProduct.price)}</p>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#c49d52] text-[#111111]">
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </Link>
            ) : (
              <div className="absolute bottom-5 right-0 w-[72%] rounded-[1.5rem] border border-white/10 bg-[#191919]/92 p-5 backdrop-blur sm:bottom-10 sm:w-[58%]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#c49d52]">The next collection</p>
                <p className="mt-2 text-sm leading-6 text-white/72">Join us on WhatsApp for availability and the latest drops.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border-b border-border/40 bg-white/70" aria-label="Store services">
        <div className="mx-auto grid max-w-7xl divide-y divide-border/50 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 md:px-6 lg:px-10">
          <div className="flex min-h-20 items-center gap-3 py-4 sm:pr-5">
            <CreditCard className="h-5 w-5 shrink-0 text-bronze" aria-hidden />
            <p className="text-sm font-semibold text-ink">Pay on delivery</p>
          </div>
          <div className="flex min-h-20 items-center gap-3 py-4 sm:px-5">
            <Truck className="h-5 w-5 shrink-0 text-bronze" aria-hidden />
            <p className="text-sm font-semibold text-ink">Nairobi delivery</p>
          </div>
          <div className="flex min-h-20 items-center gap-3 py-4 sm:pl-5">
            <MessageCircle className="h-5 w-5 shrink-0 text-bronze" aria-hidden />
            <p className="text-sm font-semibold text-ink">WhatsApp ordering</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-6 lg:px-10 lg:py-20">
        <div className="mb-8 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="section-label">Featured products</p>
            <h2 className="mt-3 font-serif text-3xl text-ink sm:text-4xl">The Auro edit</h2>
          </div>
          <Link href="/shop" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink transition hover:text-bronze sm:gap-2 sm:text-sm sm:tracking-[0.16em]">
            Browse all
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {featuredProducts.length ? (
          <ProductGallery products={featuredProducts} />
        ) : (
          <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-[#171513] p-8 text-white shadow-luxe sm:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#c49d52]">The edit is being prepared</p>
            <h3 className="mt-3 max-w-xl font-serif text-3xl sm:text-4xl">New pieces are entering the spotlight soon.</h3>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/68">Browse the full catalog or ask us directly about current availability.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/shop" className="btn-primary min-h-11 bg-[#c49d52] text-[#111111]">Browse the shop</Link>
              {whatsappUrl ? (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-outline min-h-11 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">WhatsApp us</a>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 md:px-6 lg:px-10 lg:pb-20">
        <div className="mb-8">
          <p className="section-label">Shop by category</p>
          <h2 className="mt-3 font-serif text-3xl text-ink sm:text-4xl">Find your next signature</h2>
        </div>
        {categories.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
            {categories.map(category => {
              const image = getSafeCatalogImageUrl(category.image_url)
                || getSafeCatalogImageUrl(representativeMap.get(category.id));
              return (
                <Link
                  key={category.id}
                  href={`/shop/${category.slug}`}
                  className="group relative aspect-[4/5] min-w-0 overflow-hidden rounded-[1.5rem] bg-[#211d19] shadow-card md:aspect-[5/4]"
                >
                  {image ? (
                    <Image
                      src={image}
                      alt={`${category.name} collection`}
                      fill
                      sizes="(max-width: 767px) 50vw, 33vw"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_25%,rgba(196,157,82,0.28),transparent_45%),linear-gradient(145deg,#2b241e,#121110)]">
                      <span className="font-serif text-7xl text-[#c49d52]/30" aria-hidden>{category.name.charAt(0)}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/12 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white md:p-6">
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-serif text-2xl md:text-3xl">{category.name}</h3>
                        {category.description ? (
                          <p className="mt-1 hidden line-clamp-2 text-sm leading-6 text-white/68 md:block">{category.description}</p>
                        ) : null}
                      </div>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/20 transition group-hover:bg-[#c49d52] group-hover:text-[#111111]">
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-bronze/30 bg-white/60 px-6 py-12 text-center">
            <p className="font-serif text-3xl text-ink">The collection is taking shape</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Categories will appear here as soon as the next edit is ready.</p>
          </div>
        )}
      </section>

      <section className="border-y border-border/50 bg-white/55 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-5 md:px-6 lg:px-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="section-label">How it works</p>
              <h2 className="mt-3 font-serif text-3xl text-ink sm:text-4xl">From edit to doorstep</h2>
            </div>
            <Link href="/how-to-order" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink hover:text-bronze">
              Full ordering guide <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {[
              { number: "01", title: "Pick a piece", copy: "Explore the catalog and choose the finish for your look.", Icon: ShoppingBag },
              { number: "02", title: "Checkout in 30 seconds", copy: "Share your name, phone, and delivery location without creating an account.", Icon: PackageCheck },
              { number: "03", title: "Pay on delivery or confirm on WhatsApp", copy: "Choose the ordering route that works for you at checkout.", Icon: Check }
            ].map(step => (
              <article key={step.number} className="rounded-[1.5rem] border border-border/60 bg-white/80 p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <step.Icon className="h-5 w-5 text-bronze" aria-hidden />
                  <span className="font-serif text-2xl text-champagne/70">{step.number}</span>
                </div>
                <h3 className="mt-6 font-serif text-2xl text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#111111] py-16 text-white">
        <div className="mx-auto max-w-7xl px-5 md:px-6 lg:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c49d52]">Loved in Nairobi</p>
          <h2 className="mt-3 max-w-2xl font-serif text-3xl sm:text-4xl">A boutique path built around real-life plans.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
              <MapPin className="h-5 w-5 text-[#c49d52]" aria-hidden />
              <h3 className="mt-4 font-serif text-2xl">Nairobi based</h3>
              <p className="mt-2 text-sm leading-6 text-white/68">Local delivery details are confirmed during ordering.</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
              <CreditCard className="h-5 w-5 text-[#c49d52]" aria-hidden />
              <h3 className="mt-4 font-serif text-2xl">Cash on delivery</h3>
              <p className="mt-2 text-sm leading-6 text-white/68">A supported checkout option for eligible orders.</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
              <MessageCircle className="h-5 w-5 text-[#c49d52]" aria-hidden />
              <h3 className="mt-4 font-serif text-2xl">Direct confirmation</h3>
              <p className="mt-2 text-sm leading-6 text-white/68">WhatsApp ordering connects you directly to the store when configured.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-6 lg:px-10 lg:py-20">
        <div className="overflow-hidden rounded-[2rem] bg-[#c49d52] px-6 py-10 text-[#111111] shadow-luxe sm:px-10 sm:py-12">
          <div className="flex flex-col items-start justify-between gap-7 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em]">Auro Ardon</p>
              <h2 className="mt-3 max-w-2xl font-serif text-4xl leading-tight sm:text-5xl">Make the next piece unmistakably yours.</h2>
            </div>
            <div className="flex w-full flex-wrap gap-3 md:w-auto md:justify-end">
              <Link href="/shop" className="btn-primary min-h-12 flex-1 bg-[#111111] text-white md:flex-none">Shop the collection</Link>
              {whatsappUrl ? (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-[#111111]/25 px-6 text-sm font-semibold uppercase tracking-[0.14em] transition hover:bg-white/30 md:flex-none">
                  <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp us
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
