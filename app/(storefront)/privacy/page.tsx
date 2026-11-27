import Link from "next/link";

import { getStoreSettings } from "@/lib/data";
import {
  formatLegalLastUpdatedDate,
  LEGAL_DRAFT_HTML_COMMENT
} from "@/lib/policies";
import { buildPageMetadata } from "@/lib/seo";
import { formatWhatsAppNumber } from "@/lib/utils";

export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "How Auro Ardon collects, uses, retains, and protects customer delivery details under Kenya's Data Protection Act, 2019.",
  pathname: "/privacy"
});

export default async function PrivacyPage() {
  const settings = await getStoreSettings();
  const displayPhone = formatWhatsAppNumber(
    settings.business_phone || settings.whatsapp_number
  );
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
        Kenya Data Protection Act, 2019
      </p>
      <h1 className="mt-2 font-serif text-[40px] font-normal leading-[1.12] tracking-[-0.01em] text-text md:text-[56px]">
        Privacy Policy
      </h1>
      <p className="mt-3 font-sans text-[13px] text-muted">
        Last updated: {lastUpdated} · {settings.site_name} ({settings.business_address})
      </p>

      <div className="mt-8 space-y-8 font-sans text-[15px] leading-[1.65] text-text">
        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            1. Who we are (Data Controller)
          </h2>
          <p className="text-muted">
            {settings.site_name} is a small retail boutique operating in{" "}
            {settings.business_address}. We act as the Data Controller for the personal information you share when ordering, tracking a delivery, joining a back-in-stock alert, or leaving a verified review on this website.
          </p>
          {/* TODO(owner): confirm registered business name, physical office address, and official privacy email before launch */}
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            2. What personal data we collect and why
          </h2>
          <p className="text-muted">
            We collect only the minimum information required to process and deliver your order:
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-muted">
            <li>
              <strong className="text-text">Name, phone number, and delivery address:</strong>{" "}
              used to confirm your order on WhatsApp, prepare your parcel, issue your invoice or receipt, and deliver to your Nairobi zone or upcountry courier town.
            </li>
            <li>
              <strong className="text-text">Optional gift and delivery notes:</strong>{" "}
              used only to print your gift message or guide your rider to the right landmark.
            </li>
            <li>
              <strong className="text-text">Verified buyer reviews (optional):</strong>{" "}
              your star rating, comment, and optional photo linked to your delivered order. We automatically strip camera EXIF and GPS location metadata from uploaded photos, and only display your first name and last initial (for example, &ldquo;Amina W.&rdquo;) publicly.
            </li>
            <li>
              <strong className="text-text">Back-in-stock alerts (optional):</strong>{" "}
              your phone number and optional name if you ask to be messaged when an out-of-stock item returns.
            </li>
            <li>
              <strong className="text-text">Privacy-friendly storefront analytics:</strong>{" "}
              we record anonymous browsing milestones (such as product views and bag actions) using a random session identifier. We do not store your name, phone number, or IP address in analytics events.
            </li>
          </ul>
          <p className="text-muted">
            Because orders are paid in cash or via M-Pesa on delivery, we never ask for or store credit/debit card numbers or M-Pesa PINs.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            3. How long we keep your data
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 text-muted">
            <li>
              <strong className="text-text">Orders, invoices, payments, and credit notes:</strong>{" "}
              retained for 7 years to meet Kenyan tax, accounting, and statutory recordkeeping requirements under Kenyan law.
              {/* TODO(owner): confirm 7-year accounting retention period with your accountant */}
            </li>
            <li>
              <strong className="text-text">Delivery profile and contact history:</strong>{" "}
              kept while you remain an active customer so repeat deliveries and support requests are faster, or until you ask us to delete or anonymise your profile.
            </li>
            <li>
              <strong className="text-text">Back-in-stock waitlist entries:</strong>{" "}
              kept until we notify you of a restock or you ask to be removed.
            </li>
            <li>
              <strong className="text-text">Anonymous storefront analytics events:</strong>{" "}
              automatically purged after 12 months.
            </li>
          </ul>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            4. Who sees your data
          </h2>
          <p className="text-muted">
            We never sell, rent, or trade your personal details. Your data is shared strictly on a need-to-know basis with:
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-muted">
            <li>
              <strong className="text-text">Authorised {settings.site_name} team members</strong>{" "}
              preparing orders, issuing invoices, and assisting customers.
            </li>
            <li>
              <strong className="text-text">Delivery riders and upcountry courier partners:</strong>{" "}
              receive only your name, phone number, delivery address/zone, and amount to collect on delivery so they can complete handover.
            </li>
            <li>
              <strong className="text-text">Technical service providers:</strong>{" "}
              trusted hosting and database infrastructure (such as Vercel and Supabase) that process data securely on our behalf.
            </li>
          </ul>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            5. WhatsApp communications
          </h2>
          <p className="text-muted">
            We use WhatsApp to confirm your order, send your rider&apos;s name and phone number when dispatched, share your tracking and invoice links, and follow up on exchanges or delivery questions. Messages exchanged on WhatsApp are also subject to WhatsApp&apos;s own privacy policy.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            6. Marketing consent and opt-out
          </h2>
          <p className="text-muted">
            We only send promotional updates, new-arrival alerts, or discount offers if you explicitly opt in (for example, by ticking the optional marketing checkbox at checkout). You can opt out at any time by replying <strong className="text-text">STOP</strong> on WhatsApp or contacting us — we will immediately stop marketing messages while still sending essential updates for any active order.
          </p>
        </section>

        <section className="space-y-2.5">
          <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
            7. Your rights &amp; how to request access or deletion
          </h2>
          <p className="text-muted">
            Under Section 26 of Kenya&apos;s Data Protection Act, 2019, you have the right to:
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-muted">
            <li>Request confirmation of and access to the personal data we hold about you.</li>
            <li>Request correction of inaccurate or incomplete delivery or contact details.</li>
            <li>Withdraw marketing consent or object to non-essential processing.</li>
            <li>
              Request deletion or anonymisation of your personal details. Where Kenyan tax law requires us to preserve historical invoice totals, we permanently scrub your name, phone number, and street address from our customer records while retaining anonymised accounting figures.
            </li>
          </ul>
          <p className="text-muted">
            To exercise any of these rights, message us via{" "}
            {displayPhone ? (
              <>
                WhatsApp at <strong className="text-text">{displayPhone}</strong>
                {settings.business_email ? (
                  <>
                    , email{" "}
                    <a
                      href={`mailto:${settings.business_email}`}
                      className="text-text underline underline-offset-4 hover:text-price"
                    >
                      {settings.business_email}
                    </a>
                  </>
                ) : null}
                , or use our{" "}
              </>
            ) : (
              "our "
            )}
            <Link
              href="/contact"
              className="text-text underline underline-offset-4 hover:text-price"
            >
              Contact page
            </Link>
            . We aim to respond to all privacy requests within 14 days.
            {/* TODO(owner): confirm 14-day privacy response timeline and add dedicated privacy email in Store Settings */}
          </p>
          <p className="text-muted">
            If you believe your data protection rights have been infringed, you also have the right to lodge a complaint with the{" "}
            <strong className="text-text">
              Office of the Data Protection Commissioner (ODPC)
            </strong>{" "}
            in Kenya.
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-text/12 pt-6">
        <Link href="/terms" className="btn-outline">
          Read Terms of Service
        </Link>
        <Link href="/contact" className="btn-primary">
          Contact us about privacy
        </Link>
      </div>
    </section>
  );
}
