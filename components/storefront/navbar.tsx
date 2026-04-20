"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, ShoppingBag, Gem } from "lucide-react";
import { useCart, useCartValue } from "@/lib/cart";

// ─── Nav links ────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Shop All",         href: "/shop" },
  { label: "Jewelry",           href: "/shop/jewelry" },
  { label: "Lip Care",          href: "/shop/lip-care" },
  { label: "Hair Accessories",  href: "/shop/hair-accessories" },
] as const;

// ─── Navbar Component ─────────────────────────────────────
export function Navbar() {
   const [mobileOpen, setMobileOpen] = useState(false);
   const [scrolled,   setScrolled]   = useState(false);
   const { itemCount } = useCartValue();

  // Add background blur once user scrolls past 20px
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      {/* ── Fixed Header ── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? "nav-blur shadow-sm" : "bg-transparent"
        }`}
        style={{ height: "var(--nav-height, 72px)" }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-5 lg:px-10">

          {/* ── Brand logo ── */}
          <Link
            href="/"
            aria-label="Auro Ardon home"
            className="group flex items-center gap-2.5 focus-visible:outline-none"
          >
            {/* Gem icon badge */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-champagne to-bronze shadow-sm transition-shadow duration-300 group-hover:shadow-glow">
              <Gem className="h-4 w-4 text-white" aria-hidden />
            </div>
            {/* Brand name */}
            <span className="font-serif text-[1.45rem] leading-none tracking-tight text-ink">
              Auro <span className="gradient-text">Ardon</span>
            </span>
          </Link>

          {/* ── Desktop nav links ── */}
          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="relative text-sm font-semibold uppercase tracking-[0.15em] text-muted
                           transition-colors duration-200 hover:text-bronze
                           after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-0
                           after:bg-bronze after:transition-all after:duration-300
                           hover:after:w-full"
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* ── Right-side actions ── */}
          <div className="flex items-center gap-2">
            {/* Cart icon with item count */}
            <Link
              href="/cart"
              aria-label={`Shopping cart with ${itemCount} items`}
              className="relative flex h-10 w-10 items-center justify-center rounded-full
                         border border-border/60 bg-white/60 text-ink
                         transition-all duration-200
                         hover:border-bronze hover:bg-white hover:text-bronze"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              {itemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center
                                 rounded-full bg-bronze text-[10px] font-bold text-white">
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              )}
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              className="flex h-10 w-10 items-center justify-center rounded-full
                         border border-border/60 bg-white/60 text-ink
                         transition-all duration-200 hover:border-bronze lg:hidden"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* ── Mobile slide-down menu ── */}
        <div
          className={`overflow-hidden transition-all duration-300 lg:hidden ${
            mobileOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <nav
            className="flex flex-col border-t border-border/40 bg-cream/96 px-5 py-3 backdrop-blur-lg"
            aria-label="Mobile navigation"
          >
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center border-b border-border/30 py-4
                           text-sm font-semibold uppercase tracking-[0.18em] text-ink
                           transition-colors duration-150 hover:text-bronze"
              >
                {label}
              </Link>
            ))}

            {/* Subtle admin link — not promoted */}
            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              className="mt-4 text-xs font-medium uppercase tracking-widest text-muted/50
                         transition-colors hover:text-muted"
            >
              Admin portal
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Mobile menu backdrop ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
    </>
  );
}
