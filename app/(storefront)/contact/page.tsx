import { MapPin, MessageCircle, Phone } from "lucide-react";

import { ContactForm } from "@/components/storefront/contact-form";
import { formatWhatsAppNumber, normalizeWhatsAppNumber } from "@/lib/utils";

export const metadata = {
  title: "Contact Us | Auro Ardon",
  description: "Ask Auro Ardon about products, orders, and delivery through the configured store contact."
};

export default function ContactPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? null;
  const normalizedNumber = normalizeWhatsAppNumber(whatsappNumber);
  const displayNumber = formatWhatsAppNumber(whatsappNumber);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 md:px-6 lg:px-10 lg:py-16">
      <header className="mx-auto mb-10 max-w-2xl text-center">
        <p className="section-label">Get in touch</p>
        <h1 className="heading-display mt-3">Let&apos;s find your piece</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Ask about an item, an existing order, or delivery. Your message opens as a complete WhatsApp conversation for you to review and send.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <ContactForm whatsappNumber={whatsappNumber} />

        <aside className="space-y-5">
          <div className="rounded-[2rem] border border-white/60 bg-white/75 p-7 shadow-luxe backdrop-blur">
            <h2 className="font-serif text-2xl text-ink">Store contact</h2>
            <div className="mt-6 space-y-5">
              <div className="flex min-h-11 items-center gap-4">
                <MapPin className="h-5 w-5 shrink-0 text-bronze" aria-hidden />
                <div>
                  <p className="font-medium text-ink">Location</p>
                  <p className="text-sm text-muted">Nairobi, Kenya</p>
                </div>
              </div>
              {normalizedNumber && displayNumber ? (
                <div className="flex min-h-11 items-center gap-4">
                  <Phone className="h-5 w-5 shrink-0 text-bronze" aria-hidden />
                  <div>
                    <p className="font-medium text-ink">WhatsApp and phone</p>
                    <a href={`tel:+${normalizedNumber}`} className="text-sm text-muted transition hover:text-bronze">{displayNumber}</a>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  Store messaging is temporarily unavailable because the WhatsApp contact is not configured.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] bg-[#111111] p-7 text-white shadow-luxe">
            <MessageCircle className="h-5 w-5 text-[#c49d52]" aria-hidden />
            <h2 className="mt-4 font-serif text-2xl">What happens next?</h2>
            <p className="mt-2 text-sm leading-6 text-white/68">
              WhatsApp opens with every detail you entered. Review the message, tap send, and continue directly with the store.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
