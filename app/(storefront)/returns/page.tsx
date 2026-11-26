import Link from "next/link";

import { getStoreSettings } from "@/lib/data";
import { RETURNS_POLICY_CONFIG } from "@/lib/policies";
import { buildPageMetadata } from "@/lib/seo";
import { createWhatsAppLink } from "@/lib/utils";

export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "Returns & Exchanges",
  description:
    "Clear exchange window, hygiene rules for earrings and beauty/lip products, 48-hour damage reporting, and M-Pesa reversal or store credit refunds at Auro Ardon.",
  pathname: "/returns"
});

export default async function ReturnsPage() {
  const settings = await getStoreSettings();
  const whatsappUrl = createWhatsAppLink(
    settings.whatsapp_number,
    `Hi ${settings.site_name}, I would like help with a return or exchange for my order.`
  );

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      {/* TODO(owner): confirm 7-day exchange window and preferred refund method (M-Pesa reversal vs store credit) before launch */}
      <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-brass">
        Fair &amp; transparent
      </p>
      <h1 className="mt-2 font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        Returns &amp; exchanges
      </h1>
      <p className="mt-4 font-sans text-[16px] leading-[1.55] text-muted">
        You are always welcome to inspect your order on arrival before paying your rider. If anything is not right after handover, here is how exchanges and returns work.
      </p>

      {/* Summary highlights */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="border border-text/12 bg-paper p-5">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-brass">
            Exchange window
          </p>
          <p className="mt-2 font-serif text-[26px] leading-tight text-text">
            {RETURNS_POLICY_CONFIG.exchangeWindowDays} days
          </p>
          <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-muted">
            From delivery date for eligible unworn pieces in original packaging.
          </p>
        </div>

        <div className="border border-text/12 bg-paper p-5">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-brass">
            Damage reports
          </p>
          <p className="mt-2 font-serif text-[26px] leading-tight text-text">
            Within {RETURNS_POLICY_CONFIG.damageReportHours} hours
          </p>
          <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-muted">
            Message us on WhatsApp with your order number and a clear photo.
          </p>
        </div>

        <div className="border border-text/12 bg-stone p-5">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-brass">
            Refund options
          </p>
          <p className="mt-2 font-serif text-[24px] leading-tight text-text">
            M-Pesa or credit
          </p>
          <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-muted">
            Approved refunds are issued by {RETURNS_POLICY_CONFIG.refundMethodsSummary}.
          </p>
        </div>
      </div>

      <div className="mt-10 space-y-8 font-sans text-[15px] leading-[1.65] text-text">
        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal text-text">
            Eligible watches &amp; jewelry
          </h2>
          <p className="text-muted">
            Unworn necklaces, bracelets, rings, watches, and sets can be exchanged within{" "}
            <strong className="text-text">
              {RETURNS_POLICY_CONFIG.exchangeWindowDays} days of delivery
            </strong>
            , provided they are completely unworn, undamaged, and returned in their{" "}
            <strong className="text-text">original packaging and pouch</strong> with all tags or protective seals intact.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal text-text">
            Earrings &amp; beauty / lip products (hygiene policy)
          </h2>
          <p className="text-muted">
            For health and hygiene reasons,{" "}
            <strong className="text-text">
              earrings and beauty or lip care products are returnable only if unopened with their original seal intact, or if they arrive faulty or damaged
            </strong>
            . Opened earrings or used lip products cannot be accepted for exchange or return.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal text-text">
            Damaged or incorrect items
          </h2>
          <p className="text-muted">
            If your piece arrives damaged, defective, or different from what you ordered, please report it within{" "}
            <strong className="text-text">
              {RETURNS_POLICY_CONFIG.damageReportHours} hours of delivery
            </strong>{" "}
            on WhatsApp with your order number and a clear photo of the item and packaging. We will prioritize a replacement or refund at no extra delivery charge to you.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal text-text">
            Refunds &amp; credit notes
          </h2>
          <p className="text-muted">
            Once a returned item is received and inspected at our Nairobi studio, approved refunds are issued via{" "}
            <strong className="text-text">
              {RETURNS_POLICY_CONFIG.refundMethodsSummary}
            </strong>{" "}
            along with an official credit note for your records.
            {/* TODO(owner): confirm refund turnaround time and whether rider fee is deducted for non-faulty exchanges */}
          </p>
        </section>

        <section className="space-y-2.5 border-t border-text/12 pt-6">
          <h2 className="font-serif text-[26px] font-normal text-text">
            How to request a return or exchange
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-muted">
            <li>
              Send us a WhatsApp message with your <strong className="text-text">order number</strong> (e.g. AA-7F3K2) and the item name.
            </li>
            <li>
              Attach a clear photo showing the item condition or any transit damage.
            </li>
            <li>
              Our Nairobi desk ({settings.business_hours}) will confirm eligibility and coordinate exchange rider handover or return drop-off.
            </li>
          </ol>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Message us on WhatsApp
          </a>
        ) : null}
        <Link href="/contact" className="btn-outline">
          Contact page
        </Link>
        <Link href="/shipping" className="btn-outline">
          Delivery zones &amp; fees
        </Link>
      </div>
    </section>
  );
}
