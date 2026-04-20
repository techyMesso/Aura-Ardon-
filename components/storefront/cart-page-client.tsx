"use client";

import Image from "next/future/image";
import Link from "next/link";
import { Minus, Plus, Trash2, ArrowRight, ShoppingBag } from "lucide-react";

import { useCart, useCartValue } from "@/lib/cart";
import { formatCurrency } from "@/lib/utils";

export function CartPageClient() {
  const { items, updateQuantity, removeItem, clearCart } = useCart();
  const { total, itemCount } = useCartValue();

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-champagne/30 to-bronze/20 mb-6">
          <ShoppingBag className="h-9 w-9 text-bronze" />
        </div>
        <h1 className="font-serif text-4xl text-ink mb-3">Your cart is empty</h1>
        <p className="text-muted mb-8 max-w-md">
          Looks like you haven&apos;t added any pieces to your cart yet. Explore our handcrafted jewelry, lip care, and hair accessories.
        </p>
        <Link href="/shop" className="btn-primary">
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
      <div className="mb-10">
        <h1 className="heading-display">Shopping Cart</h1>
        <p className="text-muted mt-2">{itemCount} {itemCount === 1 ? "piece" : "pieces"} in your cart</p>
      </div>

      <div className="grid gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {items.map((item) => {
            const categorySlug = (item.product.category || "uncategorized").toLowerCase().replace(/\s+/g, "-");
            return (
              <div
                key={item.product.id}
                className="flex gap-6 p-6 rounded-[2rem] border border-white/60 bg-white/70 shadow-luxe backdrop-blur"
              >
                <Link href={`/shop/${categorySlug}/${item.product.slug || item.product.id}`}>
                  <div className="relative w-32 h-32 sm:w-40 sm:h-40 shrink-0 rounded-2xl overflow-hidden">
                    <Image
                      src={item.product.images[0] || "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=400&q=80"}
                      alt={item.product.title}
                      fill
                      sizes="160px"
                      className="object-cover"
                    />
                  </div>
                </Link>

                <div className="flex-1 min-w-0">
                  <Link href={`/shop/${categorySlug}/${item.product.slug || item.product.id}`}>
                    <h3 className="font-serif text-2xl text-ink hover:text-bronze transition-colors">
                      {item.product.title}
                    </h3>
                  </Link>
                  <p className="text-sm text-muted mt-1">{item.product.material}</p>
                  <p className="text-lg font-semibold text-ink mt-3">
                    {formatCurrency(item.product.price)}
                  </p>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="h-8 w-8 flex items-center justify-center rounded-full border border-border bg-white/60 text-ink transition hover:bg-sand/50"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center font-semibold text-ink">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="h-8 w-8 flex items-center justify-center rounded-full border border-border bg-white/60 text-ink transition hover:bg-sand/50"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="text-muted hover:text-red-600 transition p-2"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={clearCart}
            className="text-sm text-muted hover:text-bronze transition underline"
          >
            Clear cart
          </button>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-[2rem] border border-white/60 bg-white/70 p-8 shadow-luxe backdrop-blur">
            <h2 className="font-serif text-2xl text-ink mb-6">Order Summary</h2>

            <div className="space-y-4 text-sm">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Shipping</span>
                <span>Calculated at checkout</span>
              </div>
              <div className="border-t border-border pt-4 flex justify-between text-lg font-semibold text-ink">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            <Link
              href="/checkout"
              className="btn-primary w-full mt-8 justify-center"
            >
              Proceed to Checkout
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/shop"
              className="block text-center text-sm text-muted hover:text-bronze transition mt-4"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
