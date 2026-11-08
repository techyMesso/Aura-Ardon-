"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Search, ShoppingBag, Store } from "lucide-react";

import { useStorefrontUI } from "@/components/storefront/storefront-context";
import { useCartValue } from "@/lib/cart";
import { createWhatsAppLink } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCartValue();
  const { openCart, openSearch } = useStorefrontUI();

  const whatsappUrl =
    createWhatsAppLink(
      process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
      "Hello Auro Ardon, I would like help with a piece."
    ) || "/contact";

  const shopActive = pathname === "/shop" || pathname.startsWith("/shop/");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 h-[56px] border-t border-white/12 bg-ink text-white md:hidden"
      aria-label="Mobile bottom navigation"
    >
      <div className="mx-auto grid h-full max-w-lg grid-cols-4 font-sans text-[12px] leading-[1.5]">
        <Link
          href="/shop"
          aria-current={shopActive ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 ${
            shopActive ? "text-brass" : "text-white/80 hover:text-white"
          }`}
        >
          <Store className="h-4 w-4" aria-hidden />
          <span>Shop</span>
        </Link>

        <button
          type="button"
          onClick={openSearch}
          className="flex cursor-pointer flex-col items-center justify-center gap-0.5 text-white/80 hover:text-white"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span>Search</span>
        </button>

        <a
          href={whatsappUrl}
          target={whatsappUrl.startsWith("http") ? "_blank" : undefined}
          rel={whatsappUrl.startsWith("http") ? "noopener noreferrer" : undefined}
          className="flex flex-col items-center justify-center gap-0.5 text-white/80 hover:text-white"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          <span>WhatsApp</span>
        </a>

        <button
          type="button"
          onClick={openCart}
          className="flex cursor-pointer flex-col items-center justify-center gap-0.5 text-white/80 hover:text-white"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden />
          <span>Cart ({itemCount})</span>
        </button>
      </div>
    </nav>
  );
}
