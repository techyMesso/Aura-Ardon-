import Link from "next/link";

import { DEFAULT_STORE_CONFIG } from "@/lib/site";
import { SITE_CONFIG } from "@/lib/site-config";
import type { Category, StoreSettings } from "@/lib/types";
import { formatWhatsAppNumber, normalizeWhatsAppNumber } from "@/lib/utils";

const HELP_LINKS = [
  { label: "About", href: "/about" },
  { label: "How to order", href: "/how-to-order" },
  { label: "Track order", href: "/track" },
  { label: "Delivery", href: "/shipping" },
  { label: "Returns", href: "/returns" },
  { label: "FAQ", href: "/faq" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "/contact" }
];

interface FooterProps {
  categories: Category[];
  storeSettings?: Pick<
    StoreSettings,
    | "site_name"
    | "whatsapp_number"
    | "business_phone"
    | "business_address"
    | "business_hours"
    | "instagram_url"
    | "tiktok_url"
  >;
}

export function Footer({ categories, storeSettings }: FooterProps) {
  const year = new Date().getFullYear();
  const brandName = storeSettings?.site_name || SITE_CONFIG.brandName;
  const whatsappNumber =
    storeSettings?.whatsapp_number ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    DEFAULT_STORE_CONFIG.whatsapp_number;
  const normalizedNumber = normalizeWhatsAppNumber(whatsappNumber);
  const displayNumber = formatWhatsAppNumber(whatsappNumber);
  const address = storeSettings?.business_address || SITE_CONFIG.studioLocation;
  const hours = storeSettings?.business_hours || SITE_CONFIG.studioHours;

  const socialLinks = [
    storeSettings?.instagram_url?.trim()
      ? { label: "Instagram", href: storeSettings.instagram_url.trim() }
      : null,
    storeSettings?.tiktok_url?.trim()
      ? { label: "TikTok", href: storeSettings.tiktok_url.trim() }
      : null
  ].filter((link): link is { label: string; href: string } =>
    Boolean(link && /^https?:\/\//i.test(link.href))
  );

  const categoryLinks = [
    { label: "New in", href: "/shop?sort=newest" },
    { label: "Shop all", href: "/shop" },
    ...categories.map(category => ({
      label: category.name,
      href: `/shop/${category.slug}`
    }))
  ];

  return (
    <footer className="border-t border-white/12 bg-ink text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <Link
              href="/"
              className="font-serif text-[24px] font-normal leading-none tracking-[-0.01em] text-white"
            >
              {brandName}
            </Link>
            {socialLinks.length > 0 ? (
              <ul className="flex flex-wrap gap-4 font-sans text-[14px]">
                {socialLinks.map(social => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/75 underline underline-offset-4 transition-colors hover:text-brass"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
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
              Help &amp; Policies
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-sans text-[14px] sm:grid-cols-1">
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
            <p>{address}</p>
            <p>{hours}</p>
          </div>
        </div>

        <div className="mt-12 border-t border-white/12 pt-6 font-sans text-[14px] text-white/60">
          <p>© {year} {brandName}</p>
        </div>
      </div>
    </footer>
  );
}
