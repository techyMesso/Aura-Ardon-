import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Gem, MapPin, Sparkles } from "lucide-react";

export const metadata = {
  title: "About Auro Ardon",
  description: "Meet Auro Ardon, a Nairobi jewelry and accessories house for bold women."
};

export default function AboutPage() {
  return (
    <div className="overflow-hidden">
      <section className="bg-[#111111] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:px-6 lg:grid-cols-2 lg:px-10 lg:py-16">
          <div className="flex flex-col justify-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#c49d52]">Our point of view</p>
            <h1 className="mt-4 font-serif text-5xl leading-[1] sm:text-6xl">Made for women who set the tone.</h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-white/70">
              Auro Ardon is a Nairobi jewelry and accessories house built around bold styling, giftable details, and an ordering experience that stays personal.
            </p>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-[#211d19]">
            <Image src="/hero-jewelry.png" alt="Auro Ardon jewelry styling" fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-6 lg:px-10 lg:py-20">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { title: "Nairobi rooted", copy: "The store and delivery experience are centered in Nairobi.", Icon: MapPin },
            { title: "Bold by design", copy: "Each edit is chosen to finish a look rather than fade into it.", Icon: Sparkles },
            { title: "Personal ordering", copy: "Checkout online or continue directly with the store through WhatsApp.", Icon: Gem }
          ].map(value => (
            <article key={value.title} className="rounded-[1.5rem] border border-border/60 bg-white/75 p-6 shadow-card">
              <value.Icon className="h-5 w-5 text-bronze" aria-hidden />
              <h2 className="mt-5 font-serif text-2xl text-ink">{value.title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted">{value.copy}</p>
            </article>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-[2rem] bg-[#c49d52] p-8 sm:p-10 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#111111]/70">The collection</p>
            <h2 className="mt-2 font-serif text-4xl text-[#111111]">Find the piece that speaks first.</h2>
          </div>
          <Link href="/shop" className="btn-primary min-h-12 shrink-0 bg-[#111111] text-white">
            Shop now <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
