import Link from "next/link";
import { Gem, MapPin, Phone } from "lucide-react";

import { formatWhatsAppNumber, normalizeWhatsAppNumber } from "@/lib/utils";
import type { Category } from "@/lib/types";

const INFO_LINKS = [
  { label: "About Auro Ardon", href: "/about" },
  { label: "How to Order", href: "/how-to-order" },
  { label: "Shipping & Delivery", href: "/shipping" },
  { label: "Returns & Exchanges", href: "/returns" },
  { label: "Contact Us", href: "/contact" }
];

export function Footer({ categories }: { categories: Category[] }) {
  const year = new Date().getFullYear();
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const normalizedNumber = normalizeWhatsAppNumber(whatsappNumber);
  const displayNumber = formatWhatsAppNumber(whatsappNumber);
  const shopLinks = [
    { label: "Shop All", href: "/shop" },
    { label: "New Arrivals", href: "/shop?sort=newest" },
    ...categories.map(category => ({
      label: category.name,
      href: `/shop/${category.slug}`
    }))
  ];

  return (
    <footer className="relative mt-24 overflow-hidden bg-ink text-cream">
      <div className="pointer-events-none absolute -left-32 -top-16 h-64 w-64 rounded-full bg-bronze/45 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-5 pb-10 pt-16 sm:px-6 lg:px-10">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="group mb-5 inline-flex min-h-11 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-champagne/50 bg-white/5 shadow-sm transition-shadow group-hover:shadow-glow">
                <Gem className="h-4 w-4 text-white" aria-hidden />
              </span>
              <span className="font-serif text-2xl text-cream">
                Auro <span className="text-champagne">Ardon</span>
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-7 text-white/65">
              Nairobi jewelry and accessories for bold women, with simple checkout and direct ordering support.
            </p>
          </div>

          <div>
            <h2 className="mb-5 text-sm font-medium text-champagne">Shop</h2>
            <ul className="space-y-1">
              {shopLinks.map(link => (
                <li key={`${link.href}-${link.label}`}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center text-sm text-white/65 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="mb-5 text-sm font-medium text-champagne">Information</h2>
            <ul className="space-y-1">
              {INFO_LINKS.map(link => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center text-sm text-white/65 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="mb-5 text-sm font-medium text-champagne">Contact</h2>
            <ul className="space-y-4">
              <li className="flex min-h-11 items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-champagne" aria-hidden />
                <span className="text-sm text-white/65">Nairobi, Kenya</span>
              </li>
              {normalizedNumber && displayNumber ? (
                <li className="flex min-h-11 items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-champagne" aria-hidden />
                  <a
                    href={`tel:+${normalizedNumber}`}
                    className="text-sm text-white/65 transition-colors hover:text-white"
                  >
                    {displayNumber}
                  </a>
                </li>
              ) : null}
            </ul>
            <div className="mt-6 border-l border-champagne/60 pl-4">
              <p className="text-sm font-medium text-cream">Ordering options</p>
              <p className="mt-2 text-sm leading-6 text-white/65">
                {normalizedNumber
                  ? "Cash on delivery and WhatsApp confirmation are available at checkout."
                  : "Cash on delivery is available at checkout."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-8 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-white/50">© {year} Auro Ardon. All rights reserved.</p>
          <p className="text-xs text-white/45">Nairobi, Kenya</p>
        </div>
      </div>
    </footer>
  );
}
