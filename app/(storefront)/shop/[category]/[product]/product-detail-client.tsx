"use client";

import { useState } from "react";
import Image from "next/future/image";
import Link from "next/link";
import { Check } from "lucide-react";

import { CheckoutModal } from "@/components/storefront/checkout-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function ProductDetailClient({ product }: { product: Product }) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(product);
  const categorySlug = slugify(product.category || "jewelry");

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
      <div className="mb-8 flex items-center gap-2 text-sm text-muted">
        <Link href="/shop" className="hover:text-bronze">Shop</Link>
        <span>/</span>
        <Link href={`/shop/${categorySlug}`} className="hover:text-bronze">{product.category}</Link>
        <span>/</span>
        <span className="text-ink">{product.title}</span>
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-[2rem] bg-white/50 shadow-luxe">
          <Image
            src={product.images[0] ?? "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=1200&q=80"}
            alt={product.title}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          {product.is_featured && (
            <div className="absolute left-4 top-4">
              <span className="badge-bronze">Featured</span>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div>
            <p className="section-label">{product.category}</p>
            <h1 className="heading-display mt-2">{product.title}</h1>
            <p className="mt-4 text-2xl font-semibold text-ink">
              {formatCurrency(product.price)}
            </p>
          </div>

          <p className="text-base leading-7 text-muted">{product.description}</p>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-champagne" />
              <span className="text-sm text-ink">Premium {product.material}</span>
            </div>
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-champagne" />
              <span className="text-sm text-ink">
                {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : "Currently unavailable"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge>{product.category}</Badge>
            <Badge>{product.material}</Badge>
          </div>

          <div className="flex gap-4">
            <Button
              onClick={() => setSelectedProduct(product)}
              disabled={product.stock_quantity < 1}
              className="flex-1"
            >
              {product.stock_quantity < 1 ? "Out of Stock" : "Buy with M-Pesa"}
            </Button>
            <Link
              href="/shop"
              className="flex items-center justify-center rounded-full border border-border/40 bg-white/60 px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-ink transition hover:bg-white hover:text-bronze"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>

      {/* Sticky mobile cart bar */}
      {product.stock_quantity > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/40 bg-white/95 backdrop-blur-sm lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                <Image
                  src={product.images[0] ?? "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=100&q=80"}
                  alt={product.title}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink line-clamp-1">{product.title}</p>
                <p className="text-sm text-bronze font-medium">{formatCurrency(product.price)}</p>
              </div>
            </div>
            <Button
              onClick={() => setSelectedProduct(product)}
              className="ml-auto"
            >
              Buy Now
            </Button>
          </div>
        </div>
      )}

      <CheckoutModal
        open={Boolean(selectedProduct)}
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}