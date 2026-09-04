"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import {
  createCategoryMap,
  getCanonicalProductPath,
  getSafeCatalogImageUrl
} from "@/lib/catalog";
import { useCart, useCartValue } from "@/lib/cart";
import { formatCurrency } from "@/lib/utils";

export function CartPageClient() {
  const { items, updateQuantity, removeItem, clearCart, categories } = useCart();
  const { total, itemCount } = useCartValue();
  const categoryMap = createCategoryMap(categories);

  if (items.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <span className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-champagne/30 to-bronze/20">
          <ShoppingBag className="h-9 w-9 text-bronze" aria-hidden />
        </span>
        <h1 className="font-serif text-4xl text-ink">Your cart is empty</h1>
        <p className="mb-8 mt-3 max-w-md text-muted">
          Your next statement piece is waiting in the collection.
        </p>
        <Link href="/shop" className="btn-primary min-h-11">Start shopping</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10 lg:py-12">
      <div className="mb-8 sm:mb-10">
        <p className="section-label">Your selection</p>
        <h1 className="mt-2 font-serif text-4xl text-ink sm:text-5xl">Shopping cart</h1>
        <p className="mt-2 text-sm text-muted">{itemCount} {itemCount === 1 ? "piece" : "pieces"} in your cart</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3 lg:gap-12">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {items.map(item => {
            const productPath = getCanonicalProductPath(item.product, categoryMap);
            const atStockLimit = item.quantity >= item.product.stock_quantity;
            const media = (
              <div className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-xl bg-[#eee2d0] sm:w-36 sm:rounded-2xl">
                <Image
                  src={getSafeCatalogImageUrl(item.product.images[0]) || "/hero-jewelry.png"}
                  alt={item.product.title}
                  fill
                  sizes="(max-width: 639px) 96px, 144px"
                  className="object-cover"
                />
              </div>
            );

            return (
              <article
                key={item.product.id}
                className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-[1.5rem] border border-white/60 bg-white/75 p-3 shadow-card sm:grid-cols-[144px_minmax(0,1fr)] sm:gap-6 sm:p-5"
              >
                {productPath ? <Link href={productPath}>{media}</Link> : media}

                <div className="flex min-w-0 flex-col">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      {productPath ? (
                        <Link href={productPath} className="block">
                          <h2 className="line-clamp-2 font-serif text-xl leading-6 text-ink transition-colors hover:text-bronze sm:text-2xl">
                            {item.product.title}
                          </h2>
                        </Link>
                      ) : (
                        <h2 className="line-clamp-2 font-serif text-xl leading-6 text-ink sm:text-2xl">{item.product.title}</h2>
                      )}
                      {item.product.material ? <p className="mt-1 truncate text-xs text-muted sm:text-sm">{item.product.material}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.product.id)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-red-50 hover:text-red-700"
                      aria-label={`Remove ${item.product.title} from cart`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>

                  <p className="mt-2 text-sm font-semibold text-ink sm:text-base">{formatCurrency(item.product.price)}</p>
                  <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3">
                    <div>
                      <div className="inline-flex min-h-11 items-center rounded-full border border-border bg-white p-0.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-sand/50"
                          aria-label={`Decrease quantity of ${item.product.title}`}
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <span className="min-w-7 text-center text-sm font-semibold text-ink" aria-live="polite">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          disabled={atStockLimit}
                          className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-sand/50 disabled:text-muted/35"
                          aria-label={`Increase quantity of ${item.product.title}`}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                      {atStockLimit ? <p className="mt-1 text-[11px] text-muted">Maximum available added</p> : null}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Line total</p>
                      <p className="mt-1 text-sm font-semibold text-ink sm:text-base">
                        {formatCurrency(Number(item.product.price) * item.quantity)}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          <button type="button" onClick={clearCart} className="inline-flex min-h-11 items-center text-sm text-muted underline transition hover:text-bronze">
            Clear cart
          </button>
        </div>

        <aside className="lg:col-span-1">
          <div className="rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-luxe backdrop-blur sm:p-8 lg:sticky lg:top-24">
            <h2 className="font-serif text-2xl text-ink">Order summary</h2>
            <div className="mt-6 space-y-4 text-sm">
              <div className="flex justify-between gap-4 text-muted">
                <span>Subtotal</span>
                <span className="font-medium text-ink">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between gap-4 text-muted">
                <span>Shipping</span>
                <span className="text-right">Confirmed at checkout</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-4 text-lg font-semibold text-ink">
                <span>Order subtotal</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
            <Link href="/checkout" className="btn-primary mt-8 min-h-12 w-full justify-center">
              Proceed to checkout
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/shop" className="mt-3 flex min-h-11 items-center justify-center text-sm text-muted transition hover:text-bronze">Continue shopping</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
