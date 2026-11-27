import Link from "next/link";
import { Banknote, Smartphone } from "lucide-react";

import { DEFAULT_STORE_CONFIG } from "@/lib/site";
import { SITE_CONFIG } from "@/lib/site-config";
import type { Category, StoreSettings } from "@/lib/types";
import { formatWhatsAppNumber, normalizeWhatsAppNumber } from "@/lib/utils";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}

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
      ? {
          key: "instagram" as const,
          label: "Instagram",
          href: storeSettings.instagram_url.trim()
        }
      : null,
    storeSettings?.tiktok_url?.trim()
      ? {
          key: "tiktok" as const,
          label: "TikTok",
          href: storeSettings.tiktok_url.trim()
        }
      : null
  ].filter(
    (link): link is { key: "instagram" | "tiktok"; label: string; href: string } =>
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
            <div>
              <Link
                href="/"
                className="font-serif text-[24px] font-normal leading-[1.1] tracking-[-0.01em] text-white"
              >
                {brandName}
              </Link>
              <p className="mt-2 max-w-xs font-sans text-[13px] leading-[1.5] text-white/75">
                {SITE_CONFIG.footerTagline}
              </p>
            </div>

            <div
              aria-label="Accepted payment methods"
              className="flex flex-wrap gap-2"
            >
              <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-white/15 bg-white/5 px-2.5 py-1 font-sans text-[12px] text-white/85">
                <Banknote className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
                Cash on delivery
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-white/15 bg-white/5 px-2.5 py-1 font-sans text-[12px] text-white/85">
                <Smartphone
                  className="h-3.5 w-3.5 text-brass"
                  aria-hidden="true"
                />
                M-Pesa on delivery
              </span>
            </div>

            {socialLinks.length > 0 ? (
              <ul className="flex flex-wrap gap-4 font-sans text-[14px]">
                {socialLinks.map(social => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-white/75 underline underline-offset-4 transition-colors hover:text-brass"
                    >
                      {social.key === "instagram" ? (
                        <InstagramIcon className="h-4 w-4" />
                      ) : (
                        <TikTokIcon className="h-4 w-4" />
                      )}
                      <span>{social.label}</span>
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
