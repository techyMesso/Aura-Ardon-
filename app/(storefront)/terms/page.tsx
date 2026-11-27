import Link from "next/link";

import { getStoreSettings } from "@/lib/data";
import {
  formatCutoffEatLabel,
  formatLegalLastUpdatedDate,
  LEGAL_DRAFT_HTML_COMMENT,
  RETURNS_POLICY_CONFIG
} from "@/lib/policies";
import { buildPageMetadata } from "@/lib/seo";
import { formatCurrency } from "@/lib/utils";

export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "Terms of Service",
  description:
    "Ordering through WhatsApp, cash or M-Pesa payment on delivery, fixed Nairobi zone delivery, and exchange terms for Auro Ardon Kenya.",
  pathname: "/terms"
});

export default async function TermsPage() {
  const settings = await getStoreSettings();
  const cutoffLabel = formatCutoffEatLabel(settings.same_day_cutoff);
  const lastUpdated = formatLegalLastUpdatedDate(settings);
  const isReviewed = Boolean(settings.legal_reviewed_at);

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      {!isReviewed ? (
        <div
          dangerouslySetInnerHTML={{
            __html: LEGAL_DRAFT_HTML_COMMENT
          }}
        />
      ) : null}

      <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-price">
        Store Terms · Kenya
      </p>
      <h1 className="mt-2 font-serif text-[40px] font-normal leading-[1.12] tracking-[-0.01em] text-text md:text-[56px]">
        Terms of Service
      </h1>
      <p className="mt-3 font-sans text-[13px] text-muted">
        Last updated: {lastUpdated} · {settings.site_name} ({settings.business_address})
      </p>

      <div className="mt-8 space-y-8 font-sans text-[15px] leading-[1.65] text-text">
        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            1. About these terms
          </h2>
          <p className="text-muted">
            These Terms of Service govern orders placed through {settings.site_name}&apos;s website and confirmed via WhatsApp. By placing an order, you confirm that the contact and delivery details you provide are accurate and that you are authorised to receive and pay for the parcel at the address given.
          </p>
          {/* TODO(owner): add official registered business name / certificate number if applicable */}
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            2. Ordering on WhatsApp &amp; stock reservation
          </h2>
          <p className="text-muted">
            Submitting checkout creates an order number and temporarily reserves your chosen stock. Your order is confirmed once you send the pre-filled WhatsApp message and our studio desk verifies availability and delivery details with you.
          </p>
          <p className="text-muted">
            Pending orders that remain unconfirmed for more than{" "}
            <strong className="text-text">
              {settings.pending_auto_cancel_hours} hours
            </strong>{" "}
            are automatically cancelled so reserved pieces return to the catalog for other customers.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            3. Pricing, KES currency &amp; discount codes
          </h2>
          <p className="text-muted">
            All prices are listed in Kenyan Shillings (<strong className="text-text">KES</strong>). Applicable sale prices, delivery fees, and promo codes are calculated and verified on our server when you place your order. Unless otherwise stated, one discount code may be applied per order and codes cannot be exchanged for cash.
          </p>
          <p className="text-muted">
            If a clear typographical or pricing error appears on a product listing, we reserve the right to contact you on WhatsApp before dispatch to confirm the corrected price or cancel the order at no cost to you.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            4. Payment on delivery
          </h2>
          <p className="text-muted">
            Payment is collected <strong className="text-text">on delivery via cash or M-Pesa</strong>. We do not process online card payments or automatic M-Pesa prompts on this website. You are welcome to inspect your items at handover before paying your rider.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            5. Delivery &amp; handover
          </h2>
          <p className="text-muted">
            Fixed zone fees are published on our{" "}
            <Link
              href="/shipping"
              className="text-text underline underline-offset-4 hover:text-price"
            >
              Delivery page
            </Link>
            . Nairobi orders confirmed before {cutoffLabel} ({settings.business_hours}) are dispatched the same day by rider; upcountry deliveries outside Nairobi ship via courier within 1–2 business days.
            {settings.free_delivery_threshold > 0
              ? ` Qualifying orders of ${formatCurrency(settings.free_delivery_threshold)} or more receive free delivery.`
              : ""}
          </p>
          <p className="text-muted">
            Please ensure the phone number on your order is reachable on the day of delivery so our rider or courier can coordinate handover cleanly.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            6. Exchanges, returns &amp; damaged items
          </h2>
          <p className="text-muted">
            Please inspect your order on arrival and report any damage or wrong item within{" "}
            <strong className="text-text">
              {RETURNS_POLICY_CONFIG.damageReportHours} hours
            </strong>{" "}
            with a clear photo. Unworn jewelry and watches in original packaging may be exchanged within{" "}
            {RETURNS_POLICY_CONFIG.exchangeWindowDays} days, while earrings and beauty or lip products can only be returned if unopened or faulty. Full details are on our{" "}
            <Link
              href="/returns"
              className="text-text underline underline-offset-4 hover:text-price"
            >
              Returns &amp; Exchanges page
            </Link>
            .
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            7. Verified customer reviews
          </h2>
          <p className="text-muted">
            Product reviews may only be submitted using a verified delivered order number and matching phone number. All submissions are reviewed before publication, and we reserve the right to reject spam, offensive language, or photos containing private third-party details.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            8. Privacy &amp; governing law
          </h2>
          <p className="text-muted">
            We handle your personal delivery data in accordance with Kenya&apos;s Data Protection Act, 2019 as described in our{" "}
            <Link
              href="/privacy"
              className="text-text underline underline-offset-4 hover:text-price"
            >
              Privacy Policy
            </Link>
            . These terms are governed by the laws of the Republic of Kenya.
            {/* TODO(owner): confirm governing law & dispute resolution wording with legal advisor */}
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-text/12 pt-6">
        <Link href="/privacy" className="btn-outline">
          Read Privacy Policy
        </Link>
        <Link href="/returns" className="btn-outline">
          Returns &amp; Exchanges
        </Link>
        <Link href="/contact" className="btn-primary">
          Contact us
        </Link>
      </div>
    </section>
  );
}
