"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gem, Menu, ShoppingBag, X } from "lucide-react";

import { useCartValue } from "@/lib/cart";
import type { Category } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle";

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
  const drawerRef = useRef<HTMLElement>(null);
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
      if (event.key === "Tab") {
        const controls = drawerRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)");
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
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
        className={`fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-cream/95 text-ink backdrop-blur transition-all duration-300 ${
          scrolled ? "shadow-[0_12px_32px_rgba(43,20,37,0.09)]" : ""
        }`}
        style={{ height: "var(--nav-height, 72px)" }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link
            href="/"
            aria-label="Auro Ardon home"
            className="group flex min-h-11 min-w-0 items-center gap-2 rounded focus:outline-none focus:ring-2 focus:ring-bronze md:gap-2.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-bronze/30 bg-ink shadow-sm transition-shadow group-hover:shadow-glow">
              <Gem className="h-4 w-4 text-champagne" aria-hidden />
            </span>
            <span className="truncate font-serif text-[1.3rem] leading-none tracking-tight text-ink md:text-[1.45rem]">
              Auro <span className="text-bronze">Ardon</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-5 xl:flex" aria-label="Main navigation">
            {desktopLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`relative min-h-11 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-bronze after:absolute after:bottom-1 after:left-0 after:h-px after:bg-bronze after:transition-all ${
                  isActive(link.href)
                    ? "text-bronze after:w-full"
                    : "text-muted after:w-0 hover:text-ink hover:after:w-full"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/cart"
              aria-label={`Shopping cart with ${itemCount} items`}
              aria-current={pathname === "/cart" ? "page" : undefined}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full border text-ink transition focus:outline-none focus:ring-2 focus:ring-bronze hover:border-bronze ${
                pathname === "/cart" ? "border-bronze bg-white" : "border-border bg-white/45"
              }`}
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              {itemCount > 0 ? (
                <span
                  key={itemCount}
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 animate-pulse-soft items-center justify-center rounded-full bg-bronze px-1 text-[10px] font-bold text-white"
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
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white/45 text-ink transition hover:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze xl:hidden"
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
        className={`fixed inset-0 z-[70] xl:hidden ${
          mobileOpen ? "visible" : "invisible pointer-events-none"
        }`}
      >
        <button type="button" tabIndex={mobileOpen ? 0 : -1} aria-label="Close navigation" onClick={closeMobileMenu} className={`absolute inset-0 bg-ink/45 backdrop-blur-sm transition-opacity ${mobileOpen ? "opacity-100" : "opacity-0"}`} />
        <nav ref={drawerRef} className={`relative flex h-full w-[min(20rem,calc(100%-2rem))] flex-col border-r border-border bg-cream px-5 py-6 text-ink shadow-2xl transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`} aria-label="Mobile navigation links">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-5">
            <p className="font-serif text-2xl">Auro <span className="text-bronze">Ardon</span></p>
            <button type="button" onClick={closeMobileMenu} aria-label="Close navigation" className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-sand/60 focus:outline-none focus:ring-2 focus:ring-bronze"><X className="h-5 w-5" aria-hidden /></button>
          </div>
          <div className="mt-4 space-y-1">
            {MOBILE_LINKS.map((link, index) => (
              <Link
                key={link.href}
                ref={index === 0 ? firstMenuLinkRef : undefined}
                href={link.href}
                onClick={closeMobileMenu}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`flex min-h-14 items-center rounded-xl px-3 text-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-bronze ${
                  isActive(link.href) ? "bg-bronze/10 text-bronze" : "text-ink hover:bg-sand/55"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3 px-3">
              <span className="text-sm font-medium text-muted">Appearance</span>
              <ThemeToggle />
            </div>
          </div>
          <Link
            href="/shop"
            onClick={closeMobileMenu}
            className="mt-auto inline-flex min-h-12 items-center justify-center rounded-full bg-bronze px-6 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-rose focus:outline-none focus:ring-2 focus:ring-bronze"
          >
            Shop now
          </Link>
        </nav>
      </div>
    </>
  );
}
