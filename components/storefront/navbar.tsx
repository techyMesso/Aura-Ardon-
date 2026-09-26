"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gem, Menu, ShoppingBag, X } from "lucide-react";

import { useCartValue } from "@/lib/cart";
import type { Category } from "@/lib/types";

const MOBILE_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Cart", href: "/cart" }
];

export function Navbar({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { itemCount } = useCartValue();
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const firstMenuLinkRef = useRef<HTMLAnchorElement>(null);
  const desktopLinks = [
    { label: "Shop All", href: "/shop" },
    ...categories.slice(0, 4).map(category => ({
      label: category.name,
      href: `/shop/${category.slug}`
    })),
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" }
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    const menuToggle = menuToggleRef.current;
    firstMenuLinkRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      menuToggle?.focus();
    };
  }, [mobileOpen]);

  function isActive(href: string) {
    if (href === "/") return pathname === href;
    if (href === "/shop") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b border-champagne/30 bg-ink/92 backdrop-blur transition-all duration-300 ${
          scrolled ? "bg-ink/96 shadow-card" : ""
        }`}
        style={{ height: "var(--nav-height, 72px)" }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link
            href="/"
            aria-label="Auro Ardon home"
            className="group flex min-h-11 items-center gap-2.5 rounded focus:outline-none focus:ring-2 focus:ring-champagne"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-champagne to-bronze shadow-sm transition-shadow group-hover:shadow-glow">
              <Gem className="h-4 w-4 text-white" aria-hidden />
            </span>
            <span className="font-serif text-[1.45rem] leading-none tracking-tight text-cream">
              Auro <span className="text-champagne">Ardon</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-5 xl:flex" aria-label="Main navigation">
            {desktopLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`relative min-h-11 py-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors focus:outline-none focus:ring-2 focus:ring-champagne after:absolute after:bottom-1 after:left-0 after:h-px after:bg-champagne after:transition-all ${
                  isActive(link.href)
                    ? "text-champagne after:w-full"
                    : "text-sand after:w-0 hover:text-cream hover:after:w-full"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/cart"
              aria-label={`Shopping cart with ${itemCount} items`}
              aria-current={pathname === "/cart" ? "page" : undefined}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full border text-cream transition focus:outline-none focus:ring-2 focus:ring-champagne hover:border-champagne hover:text-cream ${
                pathname === "/cart" ? "border-champagne bg-white/10" : "border-champagne/30 bg-white/5"
              }`}
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              {itemCount > 0 ? (
                <span
                  key={itemCount}
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 animate-pulse-soft items-center justify-center rounded-full bg-champagne px-1 text-[10px] font-bold text-ink"
                >
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              ) : null}
            </Link>
            <button
              ref={menuToggleRef}
              type="button"
              onClick={() => setMobileOpen(open => !open)}
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-champagne/30 bg-white/5 text-cream transition hover:border-champagne hover:text-white focus:outline-none focus:ring-2 focus:ring-champagne xl:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <div
        id="mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        className={`fixed inset-x-0 bottom-0 top-[72px] z-40 border-t border-champagne/30 bg-ink/98 px-5 py-6 backdrop-blur transition-all duration-300 xl:hidden ${
          mobileOpen ? "visible opacity-100" : "invisible pointer-events-none opacity-0"
        }`}
      >
        <nav className="mx-auto flex h-full max-w-lg flex-col" aria-label="Mobile navigation links">
          <div className="space-y-1">
            {MOBILE_LINKS.map((link, index) => (
              <Link
                key={link.href}
                ref={index === 0 ? firstMenuLinkRef : undefined}
                href={link.href}
                onClick={closeMobileMenu}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`flex min-h-14 items-center border-b border-white/10 text-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-champagne ${
                  isActive(link.href) ? "text-champagne" : "text-sand hover:text-cream"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <Link
            href="/shop"
            onClick={closeMobileMenu}
            className="mt-auto inline-flex min-h-12 items-center justify-center rounded-full bg-bronze px-6 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-rose focus:outline-none focus:ring-2 focus:ring-champagne"
          >
            Shop now
          </Link>
        </nav>
      </div>
    </>
  );
}
