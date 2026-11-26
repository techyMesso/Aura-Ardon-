import Link from "next/link";

import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "How Auro Ardon collects, uses, and protects your order and delivery details in Kenya.",
  pathname: "/privacy"
});

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <div
        dangerouslySetInnerHTML={{
          __html: "<!-- DRAFT — owner to review before publishing -->"
        }}
      />
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[56px]">
        Privacy Policy
      </h1>
      <p className="mt-3 font-sans text-[13px] text-muted">
        Draft policy prepared for Auro Ardon in alignment with Kenya&apos;s Data Protection Act, 2019.
      </p>

      <div className="mt-8 space-y-5 font-sans text-[15px] leading-[1.6] text-text">
        <p>
          When you place an order with Auro Ardon, we collect only the details needed to prepare and deliver your items: your name, Kenyan phone number, delivery area/address, and any optional gift or delivery notes.
        </p>
        <p>
          We use WhatsApp to confirm orders and share delivery updates, and share your name, phone number, and delivery location only with our Nairobi rider or courier partner fulfilling your delivery.
        </p>
        <p>
          Marketing messages are sent only if you explicitly opt in, and you can opt out or request access to or deletion of your personal details at any time via our{" "}
          <Link href="/contact" className="underline underline-offset-4 hover:text-brass">
            Contact page
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

