"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { useCart } from "@/lib/cart";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

interface ProductGalleryProps {
  products: Product[];
}

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function ProductGallery({ products }: ProductGalleryProps) {
  const { addItem } = useCart();
  const [addedProductId, setAddedProductId] = useState<string | null>(null);

  function handleAddToCart(product: Product, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    addItem(product);
    setAddedProductId(product.id);
    window.setTimeout(() => setAddedProductId(null), 1800);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map(product => {
        const categorySlug = slugify(product.category || "jewelry");
        const image = product.images[0] || "/hero-jewelry.png";
        const isAdded = addedProductId === product.id;

        return (
          <article
            key={product.id}
            className="group overflow-hidden rounded-[1.5rem] border border-border/60 bg-white/88 shadow-card transition hover:-translate-y-1 hover:shadow-luxe"
          >
            <Link href={`/shop/${categorySlug}/${product.slug || product.id}`} className="block">
              <div className="relative aspect-[4/5] overflow-hidden bg-[#f7f0e4]">
                <Image
                  src={image}
                  alt={product.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
            </Link>
            <div className="space-y-4 p-5">
              <Link href={`/shop/${categorySlug}/${product.slug || product.id}`} className="block">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c49d52]">
                    {product.category}
                  </p>
                  <h3 className="font-serif text-2xl leading-tight text-ink">{product.title}</h3>
                  <p className="text-lg font-semibold text-ink">{formatCurrency(product.price)}</p>
                </div>
              </Link>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={event => handleAddToCart(product, event)}
                  disabled={product.stock_quantity < 1 || isAdded}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition ${
                    isAdded
                      ? "bg-green-600 text-white"
                      : "border border-border/60 bg-white text-ink hover:bg-[#111111] hover:text-white"
                  }`}
                >
                  {isAdded ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                  {isAdded ? "Added" : "Add to Cart"}
                </button>
                <Link
                  href={`/shop/${categorySlug}/${product.slug || product.id}`}
                  className={`inline-flex min-w-[118px] items-center justify-center rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] ${
                    product.stock_quantity < 1
                      ? "pointer-events-none bg-sand text-muted"
                      : "bg-[#111111] text-white transition hover:bg-[#1d1d1d]"
                  }`}
                >
                  {product.stock_quantity < 1 ? "Sold Out" : "View Item"}
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
