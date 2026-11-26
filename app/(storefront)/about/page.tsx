import Image from "next/image";
import Link from "next/link";

import { DEFAULT_PRODUCT_BLUR_DATA_URL } from "@/components/storefront/price-kes";
import { getStoreSettings } from "@/lib/data";
import {
  ABOUT_OWNER_HTML_COMMENT,
  ABOUT_OWNER_SLOTS,
  formatCutoffEatLabel
} from "@/lib/policies";
import { buildPageMetadata } from "@/lib/seo";
import { formatWhatsAppNumber, normalizeWhatsAppNumber } from "@/lib/utils";

export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "About",
  description:
    "Auro Ardon is an independent Nairobi boutique curating jewelry, watches, and lip care with honest zone fees and cash or M-Pesa payment on delivery.",
  pathname: "/about"
});

export default async function AboutPage() {
  const settings = await getStoreSettings();
  const cutoffLabel = formatCutoffEatLabel(settings.same_day_cutoff);
  const displayPhone = formatWhatsAppNumber(
    settings.business_phone || settings.whatsapp_number
  );
  const normalizedPhone = normalizeWhatsAppNumber(
    settings.business_phone || settings.whatsapp_number
  );

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <div
        dangerouslySetInnerHTML={{
          __html: ABOUT_OWNER_HTML_COMMENT
        }}
      />

      <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-brass">
        {settings.business_address}
      </p>
      <h1 className="mt-2 font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        About {settings.site_name}
      </h1>

      {/* TODO(owner): Replace fallback catalog image below with a real Nairobi studio or team photo via ABOUT_OWNER_SLOTS.studioPhotoPath */}
      <figure className="mt-8">
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-none border border-text/10 bg-stone">
          <Image
            src={ABOUT_OWNER_SLOTS.studioPhotoPath || "/hero-jewelry.png"}
            alt={
              ABOUT_OWNER_SLOTS.studioPhotoPath
                ? `${settings.site_name} Nairobi studio and team`
                : `${settings.site_name} curated Nairobi jewelry and watches collection`
            }
            fill
            priority
            placeholder="blur"
            blurDataURL={DEFAULT_PRODUCT_BLUR_DATA_URL}
            sizes="(max-width: 1024px) 100vw, 896px"
            className="object-cover"
          />
        </div>
        {ABOUT_OWNER_SLOTS.studioPhotoPath ? null : (
          <figcaption className="mt-2 font-sans text-[12px] text-muted">
            Curated pieces from our Nairobi catalog.
          </figcaption>
        )}
      </figure>

      {/* Brand story — TODO(owner): Add founder story in ABOUT_OWNER_SLOTS.brandStoryParagraphs */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5 font-sans text-[16px] leading-[1.65] text-text">
          <h2 className="font-serif text-[28px] font-normal leading-[1.1] text-text">
            How we work
          </h2>

          {ABOUT_OWNER_SLOTS.brandStoryParagraphs &&
          ABOUT_OWNER_SLOTS.brandStoryParagraphs.length > 0 ? (
            ABOUT_OWNER_SLOTS.brandStoryParagraphs.map((paragraph, index) => (
              <p key={index} className="text-muted">
                {paragraph}
              </p>
            ))
          ) : (
            <>
              <p className="text-muted">
                {settings.site_name} is an independent boutique in{" "}
                {settings.business_address} offering watches, jewelry, and beauty essentials chosen for everyday wear and gifting.
              </p>
              <p className="text-muted">
                Every order is checked by hand before leaving our desk, confirmed directly with you on WhatsApp, and delivered across Nairobi the same day when confirmed before{" "}
                {cutoffLabel}. Outside Nairobi, we ship nationwide by courier in 1–2 business days.
              </p>
              <p className="text-muted">
                We keep buying simple and honest: transparent zone delivery fees in KES, real verified customer reviews once orders are delivered, and cash or M-Pesa payment only when your parcel arrives in your hands.
              </p>
            </>
          )}
        </div>

        <aside className="space-y-5 border border-text/12 bg-stone p-6 font-sans text-[14px]">
          <h2 className="font-serif text-[22px] font-normal text-text">
            Nairobi studio desk
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-[12px] uppercase tracking-[0.12em] text-muted">
                Location
              </dt>
              <dd className="mt-0.5 text-text">{settings.business_address}</dd>
            </div>
            <div>
              <dt className="text-[12px] uppercase tracking-[0.12em] text-muted">
                Hours
              </dt>
              <dd className="mt-0.5 text-text">{settings.business_hours}</dd>
            </div>
            <div>
              <dt className="text-[12px] uppercase tracking-[0.12em] text-muted">
                Same-day Nairobi cutoff
              </dt>
              <dd className="mt-0.5 text-text">{cutoffLabel}</dd>
            </div>
            {normalizedPhone && displayPhone ? (
              <div>
                <dt className="text-[12px] uppercase tracking-[0.12em] text-muted">
                  Phone &amp; WhatsApp
                </dt>
                <dd className="mt-0.5">
                  <a
                    href={`tel:+${normalizedPhone}`}
                    className="text-text underline underline-offset-4 hover:text-brass"
                  >
                    {displayPhone}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        </aside>
      </div>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-text/12 pt-6">
        <Link href="/shop" className="btn-primary">
          Browse collection
        </Link>
        <Link href="/shipping" className="btn-outline">
          Delivery &amp; fees
        </Link>
        <Link href="/returns" className="btn-outline">
          Returns &amp; exchanges
        </Link>
        <Link href="/contact" className="btn-outline">
          Contact us
        </Link>
      </div>
    </section>
  );
}
