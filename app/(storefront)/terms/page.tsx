import Link from "next/link";

import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Terms of Service",
  description:
    "Ordering, delivery, payment on arrival, and exchange terms for Auro Ardon Nairobi.",
  pathname: "/terms"
});

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <div
        dangerouslySetInnerHTML={{
          __html: "<!-- DRAFT — owner to review before publishing -->"
        }}
      />
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[56px]">
        Terms of Service
      </h1>
      <p className="mt-3 font-sans text-[13px] text-muted">
        Draft terms for Auro Ardon Nairobi — subject to owner review before full publication.
      </p>

      <div className="mt-8 space-y-5 font-sans text-[15px] leading-[1.6] text-text">
        <p>
          Orders placed on Auro Ardon are confirmed through WhatsApp and paid via cash or M-Pesa on delivery. Prices are displayed in Kenyan Shillings (KES) and are confirmed in your order summary before dispatch.
        </p>
        <p>
          Unconfirmed pending orders may be automatically cancelled so reserved stock returns to the catalog. Please inspect items on arrival and report any issue within 48 hours per our{" "}
          <Link href="/returns" className="underline underline-offset-4 hover:text-brass">
            Returns Policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

