import Link from "next/link";

import { formatWhatsAppNumber, normalizeWhatsAppNumber } from "@/lib/utils";
import type { Category } from "@/lib/types";

const HELP_LINKS = [
  { label: "About", href: "/about" },
  { label: "How to order", href: "/how-to-order" },
  { label: "Delivery", href: "/shipping" },
  { label: "Returns", href: "/returns" },
  { label: "Contact", href: "/contact" }
];

export function Footer({ categories }: { categories: Category[] }) {
  const year = new Date().getFullYear();
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const normalizedNumber = normalizeWhatsAppNumber(whatsappNumber);
  const displayNumber = formatWhatsAppNumber(whatsappNumber);
  const categoryLinks = [
    { label: "New in", href: "/shop?sort=newest" },
    { label: "Shop all", href: "/shop" },
    ...categories.map(category => ({
      label: category.name,
      href: `/shop/${category.slug}`
    }))
  ];

  return (
    <footer className="mt-20 bg-ink text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link
              href="/"
              className="font-serif text-[24px] font-normal leading-none tracking-[-0.01em] text-white"
            >
              Auro Ardon
            </Link>
          </div>

          <div>
            <h2 className="font-sans text-[14px] font-medium text-white">
              Categories
            </h2>
            <ul className="mt-3 space-y-2 font-sans text-[14px]">
              {categoryLinks.map(link => (
                <li key={`${link.href}-${link.label}`}>
                  <Link
                    href={link.href}
                    className="text-white/70 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-sans text-[14px] font-medium text-white">
              Help
            </h2>
            <ul className="mt-3 space-y-2 font-sans text-[14px]">
              {HELP_LINKS.map(link => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-white/70 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 font-sans text-[14px] text-white/70">
            <h2 className="font-medium text-white">Nairobi studio</h2>
            {normalizedNumber && displayNumber ? (
              <p>
                <a
                  href={`tel:+${normalizedNumber}`}
                  className="hover:text-white"
                >
                  {displayNumber}
                </a>
              </p>
            ) : null}
            <p>Nairobi, Kenya</p>
            <p>Mon–Sat, 9am–7pm EAT</p>
          </div>
        </div>

        <div className="mt-12 border-t border-white/12 pt-6 font-sans text-[14px] text-white/60">
          <p>© {year} Auro Ardon</p>
        </div>
      </div>
    </footer>
  );
}
