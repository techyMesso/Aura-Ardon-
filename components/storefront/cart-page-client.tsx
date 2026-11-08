"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";

import {
  DEFAULT_PRODUCT_BLUR_DATA_URL,
  formatKES,
  PriceKES
} from "@/components/storefront/price-kes";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import {
  createCategoryMap,
  getCanonicalProductPath,
  getSafeCatalogImageUrl
} from "@/lib/catalog";
import { useCart, useCartValue } from "@/lib/cart";
import { createWhatsAppLink } from "@/lib/utils";

export function CartPageClient() {
  const { items, updateQuantity, removeItem, categories } = useCart();
  const { total, itemCount } = useCartValue();
  const { openCart, recentlyViewedProducts } = useStorefrontUI();
  const categoryMap = createCategoryMap(categories);

  useEffect(() => {
    openCart();
  }, [openCart]);

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        Bag ({itemCount})
      </h1>

      {items.length === 0 ? (
        <div className="mt-8 bg-stone p-8 font-sans text-[16px] leading-[1.5] text-text">
          <p>Your bag is empty.</p>
          <div className="mt-4">
            <Link href="/shop" className="btn-primary">
              Shop new in
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <ul className="divide-y divide-text/12 border-y border-text/12">
            {items.map(item => {
              const productPath = getCanonicalProductPath(
                item.product,
                categoryMap
              );
              const image =
                getSafeCatalogImageUrl(item.product.images[0]) ||
                "/hero-jewelry.png";
              const atLimit = item.quantity >= item.product.stock_quantity;

              return (
                <li key={item.product.id} className="flex gap-4 py-5">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-none bg-paper">
                    <Image
                      src={image}
                      alt={item.product.title}
                      fill
                      loading="lazy"
                      placeholder="blur"
                      blurDataURL={
                        item.product.blur_data_url ||
                        DEFAULT_PRODUCT_BLUR_DATA_URL
                      }
                      sizes="96px"
                      className="object-cover"
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-3">
                      {productPath ? (
                        <Link
                          href={productPath}
                          className="font-sans text-[16px] text-text hover:text-brass"
                        >
                          {item.product.title}
                        </Link>
                      ) : (
                        <p className="font-sans text-[16px] text-text">
                          {item.product.title}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        aria-label={`Remove ${item.product.title}`}
                        className="text-muted hover:text-text"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="inline-flex items-center rounded-[2px] border border-text/20">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.product.id, item.quantity - 1)
                          }
                          aria-label={`Decrease quantity of ${item.product.title}`}
                          className="flex h-9 w-9 items-center justify-center text-text hover:text-brass"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <span
                          className="min-w-8 text-center font-sans text-[14px] text-text"
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
                          className="flex h-9 w-9 items-center justify-center text-text hover:text-brass disabled:opacity-40"
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

          <div className="flex flex-col items-end gap-4">
            <div className="flex items-baseline gap-6 font-sans text-[16px]">
              <span className="text-muted">Subtotal</span>
              <PriceKES amount={total} className="text-[18px] font-medium" />
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-72">
              <Link href="/checkout" className="btn-primary w-full">
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
        </div>
      )}

      {recentlyViewedProducts.length > 0 ? (
        <section className="mt-16 border-t border-text/12 pt-10">
          <h2 className="mb-6 font-serif text-[32px] font-normal leading-[1.0] tracking-[-0.01em] text-text">
            Recently viewed
          </h2>
          <ProductGallery
            products={recentlyViewedProducts.slice(0, 4)}
            columns={4}
          />
        </section>
      ) : null}
    </div>
  );
}
