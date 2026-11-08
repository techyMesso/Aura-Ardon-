import Image from "next/image";

import { DEFAULT_PRODUCT_BLUR_DATA_URL } from "@/components/storefront/price-kes";

export const metadata = {
  title: "About",
  description:
    "Auro Ardon is a Nairobi jewelry house offering tarnish-free gold-tone stainless necklaces, bracelets, rings, earrings, watches, and gift sets."
};

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        About Auro Ardon
      </h1>

      <div className="relative mt-8 aspect-[16/10] w-full overflow-hidden rounded-none bg-paper">
        <Image
          src="/hero-jewelry.png"
          alt="Auro Ardon gold-tone jewelry collection"
          fill
          priority
          placeholder="blur"
          blurDataURL={DEFAULT_PRODUCT_BLUR_DATA_URL}
          sizes="(max-width: 1024px) 100vw, 896px"
          className="object-cover"
        />
      </div>

      <p className="mt-8 max-w-2xl font-sans text-[16px] leading-[1.5] text-text">
        Auro Ardon is a Nairobi jewelry house stocking tarnish-free gold-tone stainless necklaces, bracelets, rings, earrings, watches, and gift sets. We inspect and pack every order at our Nairobi studio, dispatch across the city the same day when ordered before 2pm, and collect payment on delivery by cash or M-Pesa.
      </p>
    </section>
  );
}
