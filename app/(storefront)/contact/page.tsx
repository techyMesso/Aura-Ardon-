import { ContactForm } from "@/components/storefront/contact-form";
import { formatWhatsAppNumber, normalizeWhatsAppNumber } from "@/lib/utils";

export const metadata = {
  title: "Contact",
  description:
    "Contact Auro Ardon in Nairobi by phone or WhatsApp about pieces, sizing, or delivery."
};

export default function ContactPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? null;
  const normalizedNumber = normalizeWhatsAppNumber(whatsappNumber);
  const displayNumber = formatWhatsAppNumber(whatsappNumber);

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        Contact
      </h1>

      <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_260px]">
        <ContactForm whatsappNumber={whatsappNumber} />

        <aside className="space-y-4 border-t border-text/12 pt-6 font-sans text-[14px] leading-[1.5] text-text lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div>
            <p className="text-muted">Location</p>
            <p className="mt-0.5">Nairobi, Kenya</p>
          </div>

          {normalizedNumber && displayNumber ? (
            <div>
              <p className="text-muted">Phone & WhatsApp</p>
              <p className="mt-0.5">
                <a
                  href={`tel:+${normalizedNumber}`}
                  className="underline underline-offset-4 hover:text-brass"
                >
                  {displayNumber}
                </a>
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-muted">Hours</p>
            <p className="mt-0.5">Mon–Sat, 9am–7pm EAT</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
