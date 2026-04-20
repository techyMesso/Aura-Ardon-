import Image from "next/future/image";
import Link from "next/link";
import {
  Gem,
  Truck,
  ShieldCheck,
  RefreshCcw,
  Star,
  ArrowRight,
  Phone,
} from "lucide-react";

import { listPublicProducts } from "@/lib/data";
import { ProductGallery } from "@/components/storefront/product-gallery";

// ─── SEO metadata for this page ──────────────────────────
export const metadata = {
  title: "Auro Ardon | African Modern Luxury Jewelry & Beauty",
  description:
    "Shop premium handcrafted jewelry, lip care, and hair accessories from Nairobi. Stainless necklaces, African bracelets, lip gloss, and more. Pay with M-Pesa.",
};

// ─── Static data ─────────────────────────────────────────

const TRUST_BADGES = [
  { icon: Truck,       label: "Free Delivery",     sub: "Within Nairobi" },
  { icon: ShieldCheck, label: "Genuine Quality",   sub: "Every piece verified" },
  { icon: RefreshCcw,  label: "Easy Returns",      sub: "30-day policy" },
  { icon: Phone,       label: "M-Pesa Checkout",   sub: "Fast & secure" },
];

const CATEGORIES = [
  {
    name:        "Jewelry",
    slug:        "jewelry",
    description: "Stainless necklaces, rings, earrings, African bracelets & brooches",
    accent:      "from-champagne/40 to-bronze/20",
    href:        "/shop/jewelry",
    icon:        "💎",
  },
  {
    name:        "Lip Care",
    slug:        "lip-care",
    description: "Nourishing glosses, oils & balms for a perfect pout",
    accent:      "from-rose/30 to-champagne/20",
    href:        "/shop/lip-care",
    icon:        "✨",
  },
  {
    name:        "Hair Accessories",
    slug:        "hair-accessories",
    description: "Pushbacks, hair bands, flower clips & stylish hair clips",
    accent:      "from-bronze/20 to-sand/50",
    href:        "/shop/hair-accessories",
    icon:        "🌸",
  },
] as const;

const TESTIMONIALS = [
  {
    name:   "Amara W.",
    text:   "The African bracelet set is absolutely stunning. The quality is premium and delivery was same day. Will order again!",
    rating: 5,
  },
  {
    name:   "Cynthia M.",
    text:   "I bought the lip gloss trio and I'm obsessed. So moisturising and the packaging feels luxurious.",
    rating: 5,
  },
  {
    name:   "Faith K.",
    text:   "The flower hair clips are so elegant. I wore them to a wedding and received so many compliments!",
    rating: 5,
  },
];

// ─── Page ────────────────────────────────────────────────
export default async function HomePage() {
  const products = await listPublicProducts();
  const featured = products.filter((p) => p.is_featured).slice(0, 6);
  const showcaseProducts = featured.length ? featured : products.slice(0, 6);

  // Filter for African bracelets (priority category)
  const africanBracelets = products.filter((p) =>
    p.category.toLowerCase().includes("bracelet") ||
    p.title.toLowerCase().includes("bracelet") ||
    p.title.toLowerCase().includes("african")
  ).slice(0, 4);

  return (
    <div className="overflow-x-hidden">

      {/* ════════════ HERO ════════════ */}
      <section className="relative min-h-[88vh] overflow-hidden">
        {/* Ambient blobs */}
        <div className="pointer-events-none absolute -right-40 top-0 h-[500px] w-[500px] rounded-full bg-champagne/15 blur-[120px]" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-[400px] w-[400px] rounded-full bg-bronze/10 blur-[100px]" />

        <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-20 lg:grid-cols-[1fr_0.95fr] lg:px-10 lg:py-24">

          {/* ── Left: text ── */}
          <div className="space-y-8 animate-fade-in">
            {/* Eyebrow badge */}
            <div className="badge-bronze w-fit">
              🇰🇪 &nbsp;Nairobi&apos;s Premium Atelier
            </div>

            {/* Headline */}
            <h1 className="heading-display max-w-2xl text-balance lg:text-7xl">
              Adorned in{" "}
              <span className="gradient-text">African Luxury</span>
            </h1>

            {/* Sub-copy */}
            <p className="max-w-xl text-lg leading-8 text-muted">
              Handcrafted jewelry, nourishing lip care, and elegant hair
              accessories — curated for the modern African woman. Pay with
              M-Pesa in seconds.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-4 pt-2">
              <Link href="/shop" className="btn-primary text-base px-8 py-4">
                Shop Collection
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#categories" className="btn-outline text-base px-8 py-4">
                Browse Categories
              </Link>
            </div>

            {/* Stats strip */}
            <div className="flex flex-wrap gap-8 border-t border-border/40 pt-8">
              {[
                { value: "500+", label: "Happy customers" },
                { value: "100%", label: "Genuine pieces" },
                { value: "1-Day", label: "Nairobi delivery" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p className="font-serif text-3xl text-ink">{value}</p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-muted">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: hero image ── */}
          <div className="relative animate-slide-up">
            {/* Decorative ring */}
            <div className="absolute -inset-4 rounded-[3rem] border border-champagne/20 opacity-60" />

            <div className="relative overflow-hidden rounded-[2.5rem] shadow-luxe">
              <Image
                src="/hero-jewelry.png"
                alt="Auro Ardon luxury jewelry collection — stainless necklaces, African bracelets, rings and earrings on cream linen"
                width={900}
                height={900}
                priority
                className="w-full object-cover"
              />
              {/* Overlay badge */}
              <div className="absolute bottom-5 left-5 right-5 glass rounded-2xl px-5 py-3 shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Gem className="h-5 w-5 text-bronze" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-ink">
                        New Arrivals
                      </p>
                      <p className="text-xs text-muted">African Bracelet Collection</p>
                    </div>
                  </div>
                  <Link
                    href="/shop/jewelry?type=african-bracelets"
                    className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-bronze"
                  >
                    Shop Now
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ TRUST BADGES ════════════ */}
      <section aria-label="Why shop with us" className="border-y border-border/40 bg-white/40 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="no-scrollbar flex gap-0 overflow-x-auto md:grid md:grid-cols-4">
            {TRUST_BADGES.map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="flex min-w-[200px] items-center gap-4 border-r border-border/30 px-8 py-6 last:border-r-0 md:min-w-0"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-champagne/30 to-bronze/20">
                  <Icon className="h-5 w-5 text-bronze" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{label}</p>
                  <p className="text-xs text-muted">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ CATEGORIES ════════════ */}
      <section id="categories" className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
        {/* Section header */}
        <div className="mb-12 text-center">
          <p className="section-label">Collections</p>
          <h2 className="heading-sub mt-3">Shop by Category</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted">
            From handcrafted jewelry to nourishing lip care, everything is
            made to make you feel beautiful every day.
          </p>
        </div>

        {/* Category grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {CATEGORIES.map(({ name, description, accent, href, icon }) => (
            <Link
              key={name}
              href={href}
              className="group relative overflow-hidden rounded-4xl border border-white/60 bg-white/60 p-8 shadow-card backdrop-blur-sm transition-all duration-300 hover:shadow-luxe hover:-translate-y-1"
            >
              {/* Gradient bg */}
              <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-60 transition-opacity group-hover:opacity-80`} />

              {/* Content */}
              <div className="relative space-y-4">
                <span className="text-5xl">{icon}</span>
                <div>
                  <h3 className="font-serif text-3xl text-ink">{name}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-bronze transition-transform group-hover:translate-x-1">
                  Shop {name}
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ════════════ AFRICAN BRACELETS SHOWCASE ════════════ */}
      {africanBracelets.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-label">Heritage collection</p>
              <h2 className="heading-sub mt-3">African Bracelets</h2>
              <p className="mt-2 max-w-xl text-sm text-muted">
                Handcrafted stainless steel bracelets inspired by African heritage and modern elegance.
              </p>
            </div>
            <Link href="/shop/jewelry" className="btn-outline shrink-0">
              View All Jewelry
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ProductGallery products={africanBracelets} />
        </section>
      )}

      {/* ════════════ FEATURED PRODUCTS ════════════ */}
      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Curated picks</p>
            <h2 className="heading-sub mt-3">
              {showcaseProducts.length ? "Featured Pieces" : "Coming Soon"}
            </h2>
          </div>
          {showcaseProducts.length > 0 && (
            <Link href="/shop" className="btn-outline shrink-0">
              View All
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {showcaseProducts.length > 0 ? (
          <ProductGallery products={showcaseProducts} />
        ) : (
          /* Empty state — shown until admin adds products */
          <div className="flex flex-col items-center justify-center gap-5 rounded-4xl border border-dashed border-bronze/30 bg-white/50 px-6 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-champagne/30 to-bronze/20">
              <Gem className="h-7 w-7 text-bronze" />
            </div>
            <div>
              <p className="font-serif text-2xl text-ink">Products Coming Soon</p>
              <p className="mt-2 text-sm text-muted">
                Add inventory through the{" "}
                <Link href="/admin" className="text-bronze underline underline-offset-2">
                  admin dashboard
                </Link>{" "}
                and they will appear here automatically.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ════════════ BRAND STORY ════════════ */}
      <section className="border-t border-border/30 bg-white/35">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:px-10">
          {/* Decorative visual */}
          <div className="relative order-2 lg:order-1">
            <div className="overflow-hidden rounded-4xl">
              <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-champagne/25 to-bronze/15">
                <div className="text-center">
                  <span className="text-8xl">✨</span>
                  <p className="mt-4 font-serif text-2xl text-ink/50">
                    Auro Ardon
                  </p>
                  <p className="text-sm text-muted/50">Est. Nairobi</p>
                </div>
              </div>
            </div>
            {/* Floating accent card */}
            <div className="absolute -bottom-4 -right-4 glass rounded-3xl px-6 py-4 shadow-luxe">
              <p className="section-label">Our Promise</p>
              <p className="mt-1 font-serif text-lg text-ink">Luxury. Always.</p>
            </div>
          </div>

          {/* Text */}
          <div className="order-1 space-y-6 lg:order-2">
            <p className="section-label">Our Story</p>
            <h2 className="heading-sub text-balance">
              Born in Nairobi,{" "}
              <span className="gradient-text">Made to Last</span>
            </h2>
            <p className="text-base leading-8 text-muted">
              Auro Ardon started with a simple belief — that every woman in
              Nairobi deserves access to premium, beautifully crafted
              accessories without flying to Paris or scrolling through
              unverified imports.
            </p>
            <p className="text-base leading-8 text-muted">
              We curate and craft stainless-steel jewelry, African-inspired
              bracelets, luxurious lip care, and elegant hair accessories —
              all with the modern Kenyan woman in mind.
            </p>
            <Link href="/about" className="btn-outline inline-flex">
              Read Our Story
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════ TESTIMONIALS ════════════ */}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
        <div className="mb-12 text-center">
          <p className="section-label">Loved by customers</p>
          <h2 className="heading-sub mt-3">What Our Clients Say</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map(({ name, text, rating }) => (
            <blockquote
              key={name}
              className="card-luxe flex flex-col gap-4 p-7"
            >
              {/* Stars */}
              <div className="flex gap-1">
                {Array.from({ length: rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-champagne text-champagne" />
                ))}
              </div>
              <p className="text-sm leading-7 text-muted">&ldquo;{text}&rdquo;</p>
              <footer className="mt-auto text-xs font-semibold uppercase tracking-widest text-bronze">
                — {name}
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      {/* ════════════ CTA BANNER ════════════ */}
      <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <div className="relative overflow-hidden rounded-4xl bg-ink px-8 py-16 text-center shadow-luxe md:px-16">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-champagne/15 blur-[80px]" />
          <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-bronze/20 blur-[80px]" />

          <div className="relative space-y-6">
            <p className="section-label text-champagne/80">Ready to shop?</p>
            <h2 className="font-serif text-4xl text-white md:text-5xl">
              Your next favourite piece <br />
              is one click away.
            </h2>
            <p className="mx-auto max-w-xl text-base leading-7 text-white/70">
              Browse our full collection and pay instantly with M-Pesa. No
              account needed — just your phone number and location.
            </p>
            <div className="flex flex-wrap justify-center gap-4 pt-2">
              <Link href="/shop" className="btn-primary bg-champagne text-ink hover:bg-gold">
                Shop the Collection
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://wa.me/254700000000"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                WhatsApp Us
              </a>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
