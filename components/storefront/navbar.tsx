"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, ShoppingBag } from "lucide-react";

import { Drawer } from "@/components/storefront/drawer";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCartValue } from "@/lib/cart";
import type { Category } from "@/lib/types";

const HELP_LINKS = [
  { label: "About", href: "/about" },
  { label: "How to order", href: "/how-to-order" },
  { label: "Delivery", href: "/shipping" },
  { label: "Returns", href: "/returns" }
];

const DEFAULT_CATEGORY_LINKS = [
  { label: "Necklaces", href: "/shop?q=necklace" },
  { label: "Bracelets", href: "/shop?q=bracelet" },
  { label: "Rings", href: "/shop?q=ring" },
  { label: "Earrings", href: "/shop?q=earring" },
  { label: "Sets", href: "/shop?q=set" }
];

export function Navbar({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { itemCount } = useCartValue();
  const { openCart, openSearch } = useStorefrontUI();

  const categoryNavLinks =
    categories.length > 0
      ? categories.slice(0, 5).map(category => ({
          label: category.name,
          href: `/shop/${category.slug}`
        }))
      : DEFAULT_CATEGORY_LINKS;

  const centerLinks = [
    ...categoryNavLinks,
    { label: "New in", href: "/shop?sort=newest" }
  ];

  function isActive(href: string) {
    if (href === "/") return pathname === href;
    if (href.startsWith("/shop?")) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      <header className="sticky top-0 z-50 h-[56px] bg-ink text-white">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              className="flex h-10 w-10 items-center justify-center rounded-[2px] text-white hover:text-brass lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>

            <Link
              href="/"
              className="font-serif text-[22px] font-normal leading-none tracking-[-0.01em] text-white"
            >
              Auro Ardon
            </Link>
          </div>

          <nav
            className="hidden items-center gap-2 font-sans text-[14px] leading-[1.5] lg:flex"
            aria-label="Catalog navigation"
          >
            {centerLinks.map((link, index) => (
              <Fragment key={`${link.href}-${link.label}`}>
                {index > 0 ? (
                  <span className="text-white/40" aria-hidden>
                    ·
                  </span>
                ) : null}
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`px-1.5 py-1 transition-colors ${
                    isActive(link.href)
                      ? "text-brass"
                      : "text-white/85 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              </Fragment>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openSearch}
              aria-label="Search pieces"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-[2px] text-white hover:text-brass"
            >
              <Search className="h-4 w-4" aria-hidden />
            </button>

            <ThemeToggle />

            <button
              type="button"
              onClick={openCart}
              aria-label={`Bag with ${itemCount} items`}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[2px] px-2.5 font-sans text-[14px] leading-[1.5] text-white hover:text-brass"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              <span>{itemCount}</span>
            </button>
          </div>
        </div>
      </header>

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        title="Auro Ardon"
        side="left"
      >
        <nav aria-label="Mobile navigation" className="space-y-6">
          <div>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/shop?sort=newest"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-11 items-center font-sans text-[16px] text-text hover:text-brass"
                >
                  New in
                </Link>
              </li>
              <li>
                <Link
                  href="/shop"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-11 items-center font-sans text-[16px] text-text hover:text-brass"
                >
                  Shop all
                </Link>
              </li>
              {categoryNavLinks.map(link => (
                <li key={`${link.href}-${link.label}`}>
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex min-h-11 items-center font-sans text-[16px] ${
                      isActive(link.href)
                        ? "text-brass"
                        : "text-text hover:text-brass"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-text/12 pt-5">
            <ul className="space-y-1">
              {HELP_LINKS.map(link => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex min-h-11 items-center font-sans text-[14px] ${
                      isActive(link.href)
                        ? "text-brass"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </Drawer>
    </>
  );
}
