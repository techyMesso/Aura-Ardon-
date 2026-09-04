"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gem, Menu, ShoppingBag, X } from "lucide-react";

import { useCartValue } from "@/lib/cart";
import type { Category } from "@/lib/types";

export function Navbar({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { itemCount } = useCartValue();
  const primaryCategories = categories.slice(0, 4);

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

  function isActive(href: string) {
    if (href === "/") return pathname === href;
    if (href === "/shop") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const staticLinks = [
    { label: "Shop All", href: "/shop" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" }
  ];
  const desktopLinks = [
    staticLinks[0],
    ...primaryCategories.map(category => ({
      label: category.name,
      href: `/shop/${category.slug}`
    })),
    ...staticLinks.slice(1)
  ];
  const mobileLinks = [
    staticLinks[0],
    ...categories.map(category => ({
      label: category.name,
      href: `/shop/${category.slug}`
    })),
    ...staticLinks.slice(1)
  ];

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "nav-blur shadow-sm"
            : "border-b border-white/5 bg-[#111111]/95 backdrop-blur"
        }`}
        style={{ height: "var(--nav-height, 72px)" }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link
            href="/"
            aria-label="Auro Ardon home"
            className="group flex min-h-11 items-center gap-2.5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-champagne to-bronze shadow-sm transition-shadow group-hover:shadow-glow">
              <Gem className="h-4 w-4 text-white" aria-hidden />
            </span>
            <span className="font-serif text-[1.45rem] leading-none tracking-tight text-white">
              Auro <span className="text-[#c49d52]">Ardon</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-5 xl:flex" aria-label="Main navigation">
            {desktopLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`relative py-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors after:absolute after:bottom-1 after:left-0 after:h-px after:bg-[#c49d52] after:transition-all ${
                  isActive(link.href)
                    ? "text-[#c49d52] after:w-full"
                    : "text-white/72 after:w-0 hover:text-[#c49d52] hover:after:w-full"
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
              className={`relative flex h-11 w-11 items-center justify-center rounded-full border text-white transition hover:border-[#c49d52] hover:text-[#c49d52] ${
                pathname === "/cart" ? "border-[#c49d52]" : "border-white/10 bg-white/5"
              }`}
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              {itemCount > 0 ? (
                <span
                  key={itemCount}
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 animate-pulse-soft items-center justify-center rounded-full bg-[#c49d52] px-1 text-[10px] font-bold text-[#111111]"
                >
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(open => !open)}
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:border-[#c49d52] xl:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div
          id="mobile-navigation"
          className={`max-h-[calc(100vh-72px)] overflow-y-auto border-t border-white/10 bg-[#111111]/98 transition-all xl:hidden ${
            mobileOpen ? "visible opacity-100" : "invisible max-h-0 opacity-0"
          }`}
        >
          <nav className="flex flex-col px-5 py-3" aria-label="Mobile navigation">
            {mobileLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`flex min-h-12 items-center border-b border-white/10 text-sm font-semibold uppercase tracking-[0.16em] transition-colors ${
                  isActive(link.href) ? "text-[#c49d52]" : "text-white hover:text-[#c49d52]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-ink/30 backdrop-blur-sm xl:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      ) : null}
    </>
  );
}
