import Link from "next/link";

import { getStoreSettings, listDeliveryZones } from "@/lib/data";
import { buildStorefrontFaqs } from "@/lib/policies";
import {
  buildFaqJsonLd,
  buildPageMetadata,
  serializeJsonLd
} from "@/lib/seo";

export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "Frequently Asked Questions",
  description:
    "Answers about ordering from Auro Ardon on WhatsApp, paying cash or M-Pesa on delivery, Nairobi delivery times and fees, order tracking, exchanges, gift orders, and discount codes.",
  pathname: "/faq"
});

export default async function FaqPage() {
  const [settings, zones] = await Promise.all([
    getStoreSettings(),
    listDeliveryZones()
  ]);

  const faqs = buildStorefrontFaqs(settings, zones);
  const faqJsonLd = buildFaqJsonLd(faqs);

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(faqJsonLd)
        }}
      />

      <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-brass">
        Help centre
      </p>
      <h1 className="mt-2 font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        Frequently asked questions
      </h1>
      <p className="mt-4 font-sans text-[16px] leading-[1.55] text-muted">
        Everything you need to know about WhatsApp ordering, paying on delivery, Nairobi zone fees, tracking, exchanges, gifts, and promo codes.
      </p>

      <dl className="mt-10 divide-y divide-text/12 border-y border-text/12">
        {faqs.map(faq => (
          <div key={faq.question} className="py-6">
            <dt className="font-serif text-[22px] font-normal leading-[1.2] text-text">
              {faq.question}
            </dt>
            <dd className="mt-2 font-sans text-[15px] leading-[1.65] text-muted">
              {faq.answer}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/shipping" className="btn-outline">
          View delivery fees
        </Link>
        <Link href="/track" className="btn-outline">
          Track an order
        </Link>
        <Link href="/returns" className="btn-outline">
          Returns &amp; exchanges
        </Link>
        <Link href="/contact" className="btn-primary">
          Ask us on WhatsApp
        </Link>
      </div>
    </section>
  );
}
