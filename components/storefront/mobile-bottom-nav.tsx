"use client";

import Link from "next/link";
import { House, MessageCircle, ShoppingBag, Store } from "lucide-react";
import { usePathname } from "next/navigation";

import { useCartValue } from "@/lib/cart";

const LINKS = [
  { label: "Home", href: "/", Icon: House },
  { label: "Shop", href: "/shop", Icon: Store },
  { label: "Cart", href: "/cart", Icon: ShoppingBag },
  { label: "Contact", href: "/contact", Icon: MessageCircle }
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCartValue();

  function isActive(href: string) {
    if (href === "/") return pathname === href;
    if (href === "/shop") return pathname === href || pathname.startsWith("/shop/");
    return pathname === href;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-cream shadow-[0_-10px_30px_rgba(43,20,37,0.2)] backdrop-blur md:hidden"
      aria-label="Mobile quick navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {LINKS.map(({ label, href, Icon }) => {
          const active = isActive(href);
          const isCart = href === "/cart";

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold tracking-[0.06em] transition focus:outline-none focus:ring-2 focus:ring-champagne ${
                active ? "bg-white/10 text-champagne" : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="relative">
                <Icon className="h-4 w-4" aria-hidden />
                {isCart && itemCount > 0 ? (
                  <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-champagne px-1 text-[9px] font-bold text-ink">
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                ) : null}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
