"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, MessageCircle, Minus, Plus, ShieldCheck, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function ProductDetailClient({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(product.images[0] || "/hero-jewelry.png");
  const categorySlug = slugify(product.category || "jewelry");
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

  const whatsappUrl = useMemo(() => {
    if (!whatsappNumber) {
      return null;
    }

    const message = [
      "Hello, I want to order this item:",
      product.title,
      `Quantity: ${quantity}`,
      `Price: ${formatCurrency(product.price)}`,
      `Product link: ${typeof window !== "undefined" ? window.location.href : ""}`
    ].join("\n");

    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  }, [product.price, product.title, quantity, whatsappNumber]);

  function increment() {
    setQuantity(current => Math.min(current + 1, Math.max(product.stock_quantity, 1)));
  }

  function decrement() {
    setQuantity(current => Math.max(1, current - 1));
  }

  function handleAddToCart() {
    addItem(product, quantity);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-6 lg:px-10 lg:py-12">
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Link href="/shop" className="hover:text-bronze">Shop</Link>
        <span>/</span>
        <Link href={`/shop/${categorySlug}`} className="hover:text-bronze">{product.category}</Link>
        <span>/</span>
        <span className="text-ink">{product.title}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-[1.75rem] bg-white shadow-card">
            <div className="relative aspect-[4/5] bg-[#f6efe3]">
              <Image
                src={selectedImage}
                alt={product.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 52vw"
                className="object-cover"
              />
            </div>
          </div>

          {product.images.length > 1 ? (
            <div className="grid grid-cols-4 gap-3">
              {product.images.map(image => (
                <button
                  key={image}
                  type="button"
                  onClick={() => setSelectedImage(image)}
                  className={`relative overflow-hidden rounded-2xl border transition ${
                    selectedImage === image ? "border-[#c49d52]" : "border-border/60"
                  }`}
                >
                  <div className="relative aspect-square">
                    <Image src={image} alt={product.title} fill sizes="120px" className="object-cover" />
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c49d52]">
              {product.category}
            </p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-ink sm:text-5xl">
              {product.title}
            </h1>
            <p className="mt-4 text-2xl font-semibold text-ink">
              {formatCurrency(product.price)}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-white/80 p-4">
              <p className="text-sm font-semibold text-ink">Pay on Delivery</p>
              <p className="mt-1 text-sm text-muted">Easy checkout, no prepaid steps.</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/80 p-4">
              <p className="text-sm font-semibold text-ink">WhatsApp Orders</p>
              <p className="mt-1 text-sm text-muted">Direct confirmation with our team.</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/80 p-4">
              <p className="text-sm font-semibold text-ink">Fast Nairobi Delivery</p>
              <p className="mt-1 text-sm text-muted">Built for everyday plans and gifting.</p>
            </div>
          </div>

          <p className="text-base leading-7 text-muted">{product.description}</p>

          <div className="space-y-3 rounded-[1.5rem] border border-border/60 bg-white/80 p-5">
            <div className="flex items-center gap-3 text-sm text-ink">
              <Check className="h-4 w-4 text-[#c49d52]" />
              <span>{product.stock_quantity > 0 ? `${product.stock_quantity} pieces available` : "Currently unavailable"}</span>
            </div>
            {product.material ? (
              <div className="flex items-center gap-3 text-sm text-ink">
                <ShieldCheck className="h-4 w-4 text-[#c49d52]" />
                <span>Material: {product.material}</span>
              </div>
            ) : null}
            <div className="flex items-center gap-3 text-sm text-ink">
              <Truck className="h-4 w-4 text-[#c49d52]" />
              <span>Delivery support available across Nairobi.</span>
            </div>
          </div>

          <div className="space-y-4 rounded-[1.5rem] border border-border/60 bg-white/80 p-5">
            <div>
              <p className="text-sm font-semibold text-ink">Quantity</p>
              <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-border/60 bg-white px-3 py-2">
                <button type="button" onClick={decrement} className="rounded-full p-2 hover:bg-sand/40">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[2rem] text-center text-base font-semibold text-ink">{quantity}</span>
                <button type="button" onClick={increment} className="rounded-full p-2 hover:bg-sand/40">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                onClick={handleAddToCart}
                disabled={product.stock_quantity < 1}
                className="min-h-[52px] bg-[#111111] text-white hover:bg-[#1c1c1c]"
              >
                Add to Cart
              </Button>
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-border/60 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-ink transition hover:bg-sand/40"
                >
                  <MessageCircle className="h-4 w-4" />
                  Order via WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {product.stock_quantity > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{product.title}</p>
              <p className="text-sm text-[#c49d52]">{formatCurrency(product.price)}</p>
            </div>
            <Button
              onClick={handleAddToCart}
              className="bg-[#111111] text-white hover:bg-[#1c1c1c]"
            >
              Add to Cart
            </Button>
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#c49d52] text-[#111111]"
                aria-label="Order via WhatsApp"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
