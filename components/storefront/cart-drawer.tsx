"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Drawer } from "@/components/storefront/drawer";
import {
  DEFAULT_PRODUCT_BLUR_DATA_URL,
  formatKES,
  PriceKES
} from "@/components/storefront/price-kes";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import {
  getSafeCatalogImageUrl,
  productHref
} from "@/lib/catalog";
import { useCart, useCartValue } from "@/lib/cart";
import { createWhatsAppLink } from "@/lib/utils";

export function CartDrawer() {
  const { items, updateQuantity, removeItem } = useCart();
  const { total, itemCount } = useCartValue();
  const {
    cartOpen,
    closeCart,
    wishlistProducts,
    toggleWishlist,
    recentlyViewedProducts
  } = useStorefrontUI();

  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

  const cartWhatsAppMessage = [
    "Hello Auro Ardon, I would like to order these pieces:",
    ...items.map(
      item =>
        `- ${item.product.title} x${item.quantity} (${formatKES(Number(item.product.price) * item.quantity)})`
    ),
    `Subtotal: ${formatKES(total)}`
  ].join("\n");

  const cartWhatsAppUrl = items.length
    ? createWhatsAppLink(whatsappNumber, cartWhatsAppMessage)
    : null;

  const wishlistWhatsAppMessage = [
    "Hello Auro Ardon, here is my saved wishlist:",
    ...wishlistProducts.map(
      product => `- ${product.title} (${formatKES(product.price)})`
    )
  ].join("\n");

  const wishlistWhatsAppUrl = wishlistProducts.length
    ? createWhatsAppLink(whatsappNumber, wishlistWhatsAppMessage)
    : null;

  return (
    <Drawer
      open={cartOpen}
      onClose={closeCart}
      title={`Bag (${itemCount})`}
      side="right"
      footer={
        items.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between font-sans text-[14px]">
              <span className="text-muted">Subtotal</span>
              <PriceKES amount={total} className="font-medium" />
            </div>
            <div className="grid gap-2">
              <Link
                href="/checkout"
                onClick={closeCart}
                className="btn-primary w-full"
              >
                Checkout
              </Link>
              {cartWhatsAppUrl ? (
                <a
                  href={cartWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline w-full"
                >
                  Continue on WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-8">
        {items.length === 0 ? (
          <div className="bg-stone p-5 font-sans text-[14px] text-text">
            <p>Your bag is empty.</p>
            <Link
              href="/shop"
              onClick={closeCart}
              className="btn-primary mt-4 w-full"
            >
              Shop new in
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-text/12">
            {items.map(item => {
              const productPath = productHref(item.product);
              const image =
                getSafeCatalogImageUrl(item.product.images[0]) ||
                "/hero-jewelry.png";
              const atLimit = item.quantity >= item.product.stock_quantity;

              return (
                <li key={item.product.id} className="flex gap-3 py-4 first:pt-0">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-none bg-paper">
                    <Image
                      src={image}
                      alt={item.product.title}
                      fill
                      placeholder="blur"
                      blurDataURL={
                        item.product.blur_data_url ||
                        DEFAULT_PRODUCT_BLUR_DATA_URL
                      }
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={productPath}
                        onClick={closeCart}
                        className="truncate font-sans text-[14px] text-text hover:text-brass"
                      >
                        {item.product.title}
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        aria-label={`Remove ${item.product.title}`}
                        className="text-muted hover:text-text"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>

                    <PriceKES amount={item.product.price} />

                    <div className="mt-2 flex items-center justify-between">
                      <div className="inline-flex items-center border border-text/20 rounded-[2px]">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.product.id, item.quantity - 1)
                          }
                          aria-label={`Decrease quantity of ${item.product.title}`}
                          className="flex h-8 w-8 items-center justify-center text-text hover:text-brass"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <span
                          className="min-w-7 text-center font-sans text-[14px] text-text"
                          aria-live="polite"
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.product.id, item.quantity + 1)
                          }
                          disabled={atLimit}
                          aria-label={`Increase quantity of ${item.product.title}`}
                          className="flex h-8 w-8 items-center justify-center text-text hover:text-brass disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>

                      <PriceKES
                        amount={Number(item.product.price) * item.quantity}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {wishlistProducts.length > 0 ? (
          <div className="border-t border-text/12 pt-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-sans text-[14px] font-medium text-text">
                Wishlist ({wishlistProducts.length})
              </h3>
              {wishlistWhatsAppUrl ? (
                <a
                  href={wishlistWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-[14px] text-brass underline underline-offset-4"
                >
                  Share wishlist on WhatsApp
                </a>
              ) : null}
            </div>
            <ul className="mt-3 divide-y divide-text/10">
              {wishlistProducts.map(product => {
                const path = productHref(product);
                return (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-2 py-2.5 text-[14px]"
                  >
                    <Link
                      href={path}
                      onClick={closeCart}
                      className="truncate text-text hover:text-brass"
                    >
                      {product.title}
                    </Link>
                    <div className="flex shrink-0 items-center gap-3">
                      <PriceKES amount={product.price} />
                      <button
                        type="button"
                        onClick={() => toggleWishlist(product.id)}
                        className="text-[12px] text-muted hover:text-text"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {recentlyViewedProducts.length > 0 ? (
          <div className="border-t border-text/12 pt-5">
            <h3 className="font-sans text-[14px] font-medium text-text">
              Recently viewed
            </h3>
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-2">
              {recentlyViewedProducts.slice(0, 6).map(product => {
                const path = productHref(product);
                const image =
                  getSafeCatalogImageUrl(product.images[0]) ||
                  "/hero-jewelry.png";
                return (
                  <Link
                    key={product.id}
                    href={path}
                    onClick={closeCart}
                    className="w-24 shrink-0"
                  >
                    <div className="relative aspect-square w-24 overflow-hidden rounded-none bg-paper">
                      <Image
                        src={image}
                        alt={product.title}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </div>
                    <p className="mt-1.5 truncate font-sans text-[12px] text-text">
                      {product.title}
                    </p>
                    <PriceKES
                      amount={product.price}
                      className="text-[12px]"
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
