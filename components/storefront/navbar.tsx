"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, ShoppingBag, Gem } from "lucide-react";
import { useCart, useCartValue } from "@/lib/cart";

// ─── Nav links ────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Shop All", href: "/shop" },
  { label: "Jewelry", href: "/shop/jewelry" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
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
          scrolled ? "nav-blur shadow-sm" : "border-b border-white/5 bg-[#111111]/88 backdrop-blur"
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
            <span className="font-serif text-[1.45rem] leading-none tracking-tight text-white">
              Auro <span className="text-[#c49d52]">Ardon</span>
            </span>
          </Link>

          {/* ── Desktop nav links ── */}
          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="relative text-sm font-semibold uppercase tracking-[0.15em] text-white/72
                           transition-colors duration-200 hover:text-[#c49d52]
                           after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-0
                           after:bg-[#c49d52] after:transition-all after:duration-300
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
                         border border-white/10 bg-white/8 text-white
                         transition-all duration-200
                         hover:border-[#c49d52] hover:bg-white/14 hover:text-[#c49d52]"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              {itemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center
                                 rounded-full bg-[#c49d52] text-[10px] font-bold text-[#111111]">
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
                         border border-white/10 bg-white/8 text-white
                         transition-all duration-200 hover:border-[#c49d52] lg:hidden"
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
            className="flex flex-col border-t border-white/10 bg-[#111111]/97 px-5 py-3 backdrop-blur-lg"
            aria-label="Mobile navigation"
          >
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center border-b border-border/30 py-4
                           text-sm font-semibold uppercase tracking-[0.18em] text-white
                           transition-colors duration-150 hover:text-[#c49d52]"
              >
                {label}
              </Link>
            ))}
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
