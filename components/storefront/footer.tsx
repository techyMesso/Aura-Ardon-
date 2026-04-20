import Link from "next/link";
import { Gem, MapPin, Phone, Instagram, Facebook } from "lucide-react";

// ─── Link data ────────────────────────────────────────────
const SHOP_LINKS = [
  { label: "Shop All",          href: "/shop" },
  { label: "Jewelry",            href: "/shop/jewelry" },
  { label: "African Bracelets", href: "/shop/jewelry" },
  { label: "Lip Care",          href: "/shop/lip-care" },
  { label: "Hair Accessories",  href: "/shop/hair-accessories" },
  { label: "New Arrivals",      href: "/shop?sort=newest" },
];

const INFO_LINKS = [
  { label: "About Auro Ardon", href: "/about" },
  { label: "How to Order", href: "/how-to-order" },
  { label: "Shipping & Delivery", href: "/shipping" },
  { label: "Returns & Exchanges", href: "/returns" },
  { label: "Contact Us", href: "/contact" },
];

// ─── TikTok SVG (no package needed) ─────────────────────
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5
               2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01
               a6.34 6.34 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.3a6.34 6.34 0 0 0 6.34 6.34
               6.34 6.34 0 0 0 6.33-6.34V9.67a8.18 8.18 0 0 0 4.78 1.52V7.75
               a4.86 4.86 0 0 1-1.01-.06z" />
    </svg>
  );
}

// ─── Footer Component ─────────────────────────────────────
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-24 overflow-hidden border-t border-border/50">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -left-32 -top-16 h-64 w-64 rounded-full bg-champagne/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-8 h-48 w-48 rounded-full bg-bronze/8 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 pt-16 pb-10 lg:px-10">

        {/* ── Main grid ── */}
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">

          {/* ─ Brand column ─ */}
          <div className="sm:col-span-2 lg:col-span-1">
            {/* Logo */}
            <Link href="/" className="group mb-5 inline-flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full
                              bg-gradient-to-br from-champagne to-bronze shadow-sm
                              transition-shadow group-hover:shadow-glow">
                <Gem className="h-4 w-4 text-white" />
              </div>
              <span className="font-serif text-2xl text-ink">Auro <span className="gradient-text">Ardon</span></span>
            </Link>

            <p className="mt-1 max-w-xs text-sm leading-7 text-muted">
              African modern luxury — handcrafted jewelry, nourishing lip care,
              and elegant hair accessories, delivered across Nairobi and Kenya.
            </p>

            {/* Social icons */}
            <div className="mt-6 flex items-center gap-2.5">
              {[
                { href: "#", label: "Instagram", Icon: Instagram },
                { href: "#", label: "Facebook",  Icon: Facebook  },
              ].map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full
                             border border-border bg-white/60 text-muted
                             transition-all duration-200
                             hover:border-bronze hover:bg-white hover:text-bronze"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
              <a
                href="#"
                aria-label="TikTok"
                className="flex h-9 w-9 items-center justify-center rounded-full
                           border border-border bg-white/60 text-muted
                           transition-all duration-200
                           hover:border-bronze hover:bg-white hover:text-bronze"
              >
                <TikTokIcon className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* ─ Shop column ─ */}
          <div>
            <h3 className="section-label mb-5">Shop</h3>
            <ul className="space-y-3">
              {SHOP_LINKS.map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-muted transition-colors duration-150 hover:text-ink"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ─ Information column ─ */}
          <div>
            <h3 className="section-label mb-5">Information</h3>
            <ul className="space-y-3">
              {INFO_LINKS.map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-muted transition-colors duration-150 hover:text-ink"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ─ Contact + Payment column ─ */}
          <div>
            <h3 className="section-label mb-5">Contact</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-bronze" />
                <span className="text-sm text-muted">Nairobi, Kenya</span>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-bronze" />
                <a
                  href="tel:+254700000000"
                  className="text-sm text-muted transition-colors hover:text-ink"
                >
                  +254 700 000 000
                </a>
              </li>
            </ul>

            {/* Payment methods card */}
            <div className="mt-7 rounded-2xl border border-border/60 bg-white/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink">
                We accept
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-lg bg-[#4bb85f] px-3 py-1 text-xs font-bold text-white shadow-sm">
                  M-Pesa
                </span>
                <span className="rounded-lg border border-border bg-white px-3 py-1
                                 text-xs font-semibold text-muted">
                  Cash on Delivery
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="mt-14 flex flex-col items-center justify-between gap-3
                        border-t border-border/40 pt-8 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-muted/65">
            © {year} Auro Ardon. All rights reserved.
          </p>
          <p className="text-xs text-muted/45">
            Handcrafted with love in Nairobi, Kenya 🇰🇪
          </p>
        </div>
      </div>
    </footer>
  );
}
