import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  ShieldCheck,
  Truck
} from "lucide-react";

import { ProductGallery } from "@/components/storefront/product-gallery";
import { listPublicProducts } from "@/lib/data";

export const metadata = {
  title: "Auro Ardon | Premium Jewelry for Bold Women",
  description:
    "Elegant jewelry and fashion accessories for bold women in Nairobi. Order through WhatsApp or pay on delivery.",
};

const FEATURE_STRIPS = [
  "Pay on Delivery Available",
  "Fast Delivery in Nairobi",
  "Order via WhatsApp"
] as const;

const CATEGORY_SPOTLIGHTS = [
  {
    name: "Necklaces",
    href: "/shop/jewelry",
    description: "Statement chains, delicate layers, and polished everyday shine."
  },
  {
    name: "Bracelets",
    href: "/shop/jewelry",
    description: "Bold cuffs and feminine stacks made to stand out on campus and beyond."
  },
  {
    name: "Rings",
    href: "/shop/jewelry",
    description: "Clean silhouettes with a luxe finish that dresses up every look."
  }
] as const;

const TESTIMONIALS = [
  {
    name: "Njeri, USIU",
    quote:
      "The quality feels expensive, the packaging is clean, and delivery was fast enough for my event."
  },
  {
    name: "Achieng, KU",
    quote:
      "I ordered through WhatsApp and the whole process felt easy and trustworthy. The bracelet was even prettier in person."
  },
  {
    name: "Wanjiru, Nairobi CBD",
    quote:
      "Auro Ardon pieces make simple outfits look elevated. I keep coming back for gifts and last-minute styling."
  }
] as const;

export default async function HomePage() {
  const products = await listPublicProducts();
  const featuredProducts = products.filter(product => product.is_featured).slice(0, 6);
  const showcaseProducts = featuredProducts.length ? featuredProducts : products.slice(0, 6);
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

  return (
    <div className="overflow-x-hidden">
      <section className="border-b border-white/10 bg-[#111111] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 md:px-6 lg:grid-cols-[1fr_1.05fr] lg:px-10 lg:py-16">
          <div className="flex flex-col justify-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-[#c49d52]">
              Auro Ardon
            </p>
            <h1 className="max-w-xl font-serif text-5xl leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              Elegant Pieces for Bold Women
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/72 sm:text-lg">
              Premium jewelry and fashion accessories for stylish women who want everyday pieces
              that still feel special.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/shop" className="btn-primary bg-[#c49d52] px-7 text-[#111111] hover:bg-[#d4a843]">
                Shop Now
                <ArrowRight className="h-4 w-4" />
              </Link>
              {whatsappNumber ? (
                <a
                  href={`https://wa.me/${whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline border-white/20 bg-white/5 px-7 text-white hover:bg-white/10 hover:text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp Us
                </a>
              ) : null}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {FEATURE_STRIPS.map(item => (
                <span
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/78"
                >
                  <CheckCircle2 className="h-4 w-4 text-[#c49d52]" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-x-8 bottom-8 top-8 rounded-[2rem] border border-[#c49d52]/20" />
            <div className="relative overflow-hidden rounded-[2rem] bg-[#1c1c1c] shadow-[0_40px_90px_rgba(0,0,0,0.38)]">
              <Image
                src="/hero-jewelry.png"
                alt="Premium jewelry styling by Auro Ardon"
                width={1200}
                height={1400}
                priority
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-5 bottom-5 rounded-[1.25rem] bg-[rgba(17,17,17,0.78)] p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#c49d52]">
                      New favorite drop
                    </p>
                    <p className="mt-1 text-sm text-white/78">
                      Bold giftable pieces, fast Nairobi delivery, easy WhatsApp support.
                    </p>
                  </div>
                  <ShieldCheck className="h-6 w-6 shrink-0 text-[#c49d52]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border/40 bg-white/70">
        <div className="mx-auto grid max-w-7xl gap-3 px-5 py-5 sm:grid-cols-3 md:px-6 lg:px-10">
          <div className="rounded-2xl border border-border/60 bg-white/85 p-4 shadow-card">
            <p className="text-sm font-semibold text-ink">Pay on Delivery Available</p>
            <p className="mt-1 text-sm text-muted">Order now and settle when your package arrives.</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-white/85 p-4 shadow-card">
            <p className="text-sm font-semibold text-ink">Fast Delivery in Nairobi</p>
            <p className="mt-1 text-sm text-muted">Built for last-minute plans, birthdays, and outfit upgrades.</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-white/85 p-4 shadow-card">
            <p className="text-sm font-semibold text-ink">Order via WhatsApp</p>
            <p className="mt-1 text-sm text-muted">Talk to us directly for confirmation, sizing help, and delivery.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-6 lg:px-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="section-label">Featured products</p>
            <h2 className="mt-3 font-serif text-3xl text-ink sm:text-4xl">Premium picks this week</h2>
          </div>
          <Link href="/shop" className="btn-ghost hidden sm:inline-flex">
            Browse all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <ProductGallery products={showcaseProducts} />
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 md:px-6 lg:px-10">
        <div className="mb-8">
          <p className="section-label">Categories</p>
          <h2 className="mt-3 font-serif text-3xl text-ink sm:text-4xl">Necklaces, bracelets, rings</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {CATEGORY_SPOTLIGHTS.map(category => (
            <Link
              key={category.name}
              href={category.href}
              className="group rounded-[1.5rem] border border-border/60 bg-white/80 p-6 shadow-card transition hover:-translate-y-1 hover:shadow-luxe"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-2xl text-ink">{category.name}</h3>
                <ArrowRight className="h-5 w-5 text-[#c49d52] transition group-hover:translate-x-1" />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{category.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-[#111111] py-16 text-white">
        <div className="mx-auto max-w-7xl px-5 md:px-6 lg:px-10">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c49d52]">
                Testimonials
              </p>
              <h2 className="mt-3 font-serif text-3xl sm:text-4xl">Why customers trust the brand</h2>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/72 md:flex">
              <Truck className="h-4 w-4 text-[#c49d52]" />
              Nairobi delivery support
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map(testimonial => (
              <article
                key={testimonial.name}
                className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 backdrop-blur"
              >
                <p className="text-base leading-7 text-white/78">&ldquo;{testimonial.quote}&rdquo;</p>
                <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-[#c49d52]">
                  {testimonial.name}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
