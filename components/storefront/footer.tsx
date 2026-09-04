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
    <footer className="relative mt-24 overflow-hidden border-t border-border/50">
      <div className="pointer-events-none absolute -left-32 -top-16 h-64 w-64 rounded-full bg-champagne/10 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-5 pb-10 pt-16 sm:px-6 lg:px-10">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="group mb-5 inline-flex min-h-11 items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-champagne to-bronze shadow-sm transition-shadow group-hover:shadow-glow">
                <Gem className="h-4 w-4 text-white" aria-hidden />
              </span>
              <span className="font-serif text-2xl text-ink">
                Auro <span className="gradient-text">Ardon</span>
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-7 text-muted">
              Nairobi jewelry and accessories for bold women, with simple checkout and direct ordering support.
            </p>
          </div>

          <div>
            <h2 className="section-label mb-5">Shop</h2>
            <ul className="space-y-1">
              {shopLinks.map(link => (
                <li key={`${link.href}-${link.label}`}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="section-label mb-5">Information</h2>
            <ul className="space-y-1">
              {INFO_LINKS.map(link => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="section-label mb-5">Contact</h2>
            <ul className="space-y-4">
              <li className="flex min-h-11 items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-bronze" aria-hidden />
                <span className="text-sm text-muted">Nairobi, Kenya</span>
              </li>
              {normalizedNumber && displayNumber ? (
                <li className="flex min-h-11 items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-bronze" aria-hidden />
                  <a
                    href={`tel:+${normalizedNumber}`}
                    className="text-sm text-muted transition-colors hover:text-ink"
                  >
                    {displayNumber}
                  </a>
                </li>
              ) : null}
            </ul>
            <div className="mt-6 rounded-2xl border border-border/60 bg-white/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink">Ordering options</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {normalizedNumber
                  ? "Cash on delivery and WhatsApp confirmation are available at checkout."
                  : "Cash on delivery is available at checkout."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-border/40 pt-8 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-muted/65">© {year} Auro Ardon. All rights reserved.</p>
          <p className="text-xs text-muted/55">Nairobi, Kenya</p>
        </div>
      </div>
    </footer>
  );
}
