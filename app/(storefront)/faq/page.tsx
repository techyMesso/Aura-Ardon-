import Link from "next/link";

import { getStoreSettings, listDeliveryZones } from "@/lib/data";
import {
  buildFaqJsonLd,
  buildPageMetadata,
  serializeJsonLd,
  type FaqItem
} from "@/lib/seo";
import { formatCurrency } from "@/lib/utils";

export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "Frequently Asked Questions",
  description:
    "Answers about ordering from Auro Ardon on WhatsApp, paying cash or M-Pesa on delivery, Nairobi delivery cutoffs, tracking, and exchanges.",
  pathname: "/faq"
});

export default async function FaqPage() {
  const [settings, zones] = await Promise.all([
    getStoreSettings(),
    listDeliveryZones()
  ]);

  const nairobiFees = zones
    .filter(zone => !zone.is_outside_nairobi)
    .map(zone => zone.fee);
  const minFee = nairobiFees.length ? Math.min(...nairobiFees) : 150;
  const maxFee = nairobiFees.length ? Math.max(...nairobiFees) : 350;
  const freeDeliverySentence =
    settings.free_delivery_threshold > 0
      ? ` Orders above ${formatCurrency(settings.free_delivery_threshold)} qualify for free delivery.`
      : "";

  const faqs: FaqItem[] = [
    {
      question: "How do I place an order at Auro Ardon?",
      answer:
        "Add the items you want to your bag, open checkout, choose your delivery zone, and tap the WhatsApp order button. Your order is saved immediately and opens a pre-filled WhatsApp message to our Nairobi studio so we can confirm dispatch."
    },
    {
      question: "How do I pay for my order?",
      answer:
        "You pay when your order arrives — either in cash or via M-Pesa on delivery. We do not ask for card details or online prepayments on the website."
    },
    {
      question: "How fast is delivery in Nairobi and outside Nairobi?",
      answer: `Orders placed before ${settings.same_day_cutoff} EAT (${settings.business_hours}) are dispatched the same day by rider within Nairobi. Delivery fees inside Nairobi range from ${formatCurrency(minFee)} to ${formatCurrency(maxFee)} depending on your zone.${freeDeliverySentence} Upcountry deliveries outside Nairobi ship via courier and typically arrive within 1–2 business days.`
    },
    {
      question: "Can I order a piece as a gift?",
      answer:
        "Yes. At checkout, tick the gift option to include a personal gift note and keep prices hidden on the packing slip."
    },
    {
      question: "What is your return and exchange policy?",
      answer:
        "Please inspect your order on arrival. If anything arrives damaged or incorrect, message us on WhatsApp within 48 hours with a photo. Unworn watches and jewelry in original packaging can be exchanged; earrings and lip care items can only be returned if unopened or faulty."
    },
    {
      question: "How can I track my order?",
      answer:
        "As soon as you place your order, you receive an order confirmation link showing live status updates from confirmation through rider dispatch and delivery."
    }
  ];

  const faqJsonLd = buildFaqJsonLd(faqs);

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(faqJsonLd)
        }}
      />

      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        Frequently asked questions
      </h1>
      <p className="mt-4 font-sans text-[16px] leading-[1.5] text-muted">
        Everything you need to know about WhatsApp ordering, Nairobi delivery, and paying on arrival.
      </p>

      <dl className="mt-10 divide-y divide-text/12 border-y border-text/12">
        {faqs.map(faq => (
          <div key={faq.question} className="py-6">
            <dt className="font-serif text-[22px] font-normal leading-[1.2] text-text">
              {faq.question}
            </dt>
            <dd className="mt-2 font-sans text-[15px] leading-[1.6] text-muted">
              {faq.answer}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/shop" className="btn-primary">
          Shop collection
        </Link>
        <Link href="/contact" className="btn-outline">
          Ask us on WhatsApp
        </Link>
      </div>
    </section>
  );
}

