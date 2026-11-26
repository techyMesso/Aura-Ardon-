"use client";

import Link from "next/link";
import { Heart, Trash2 } from "lucide-react";

import { formatKES } from "@/components/storefront/price-kes";
import { ProductTile } from "@/components/storefront/product-tile";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import { useCart } from "@/lib/cart";
import { formatProductTitle } from "@/lib/catalog";
import { createWhatsAppLink } from "@/lib/utils";

export function WishlistPageClient() {
  const { categories } = useCart();
  const { wishlistProducts, clearWishlist, storeSettings } = useStorefrontUI();

  const whatsappUrl = wishlistProducts.length
    ? createWhatsAppLink(
        storeSettings.whatsappNumber,
        [
          "Hi Auro Ardon! Here are the pieces I saved in my wishlist:",
          ...wishlistProducts.map(
            product =>
              `• ${formatProductTitle(product.title)} — ${formatKES(product.price)}`
          )
        ].join("\n")
      )
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-text/12 pb-6">
        <div>
          <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[56px]">
            Wishlist
          </h1>
          <p className="mt-2 font-sans text-[14px] text-muted">
            {wishlistProducts.length === 0
              ? "Save pieces you love to revisit or order on WhatsApp later."
              : wishlistProducts.length === 1
                ? "1 saved piece"
                : `${wishlistProducts.length} saved pieces`}
          </p>
        </div>

        {wishlistProducts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            {whatsappUrl && storeSettings.isStoreOpen ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline"
              >
                Share wishlist on WhatsApp
              </a>
            ) : null}
            <button
              type="button"
              onClick={clearWishlist}
              className="btn-ghost inline-flex items-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Clear all
            </button>
          </div>
        ) : null}
      </header>

      {wishlistProducts.length === 0 ? (
        <div className="bg-stone p-8 text-center sm:p-12">
          <Heart className="mx-auto h-8 w-8 text-brass" aria-hidden />
          <h2 className="mt-4 font-serif text-[26px] font-normal text-text">
            Your wishlist is empty
          </h2>
          <p className="mx-auto mt-2 max-w-md font-sans text-[14px] text-muted">
            Tap the heart icon on any piece to save it here for later.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/shop" className="btn-primary">
              Browse all pieces
            </Link>
            {categories.slice(0, 4).map(category => (
              <Link
                key={category.id}
                href={`/shop/${category.slug}`}
                className="btn-outline"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {wishlistProducts.map(product => (
            <ProductTile key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

