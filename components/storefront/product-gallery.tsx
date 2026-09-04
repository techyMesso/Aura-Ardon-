"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ShoppingBag } from "lucide-react";

import {
  createCategoryMap,
  getSafeCatalogImageUrl,
  getCanonicalProductPath,
  resolveProductCategory
} from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

interface ProductGalleryProps {
  products: Product[];
  mode?: "default" | "compact";
}

export function ProductGallery({
  products,
  mode = "default"
}: ProductGalleryProps) {
  const { addItem, categories, items } = useCart();
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const categoryMap = createCategoryMap(categories);

  function handleAddToCart(product: Product) {
    const cartQuantity = items.find(item => item.product.id === product.id)?.quantity ?? 0;
    const remaining = Math.max(0, product.stock_quantity - cartQuantity);
    if (remaining < 1) return;

    addItem(product, 1);
    setAddedProductId(product.id);
    setStatus(`${product.title} added to cart.`);
    window.setTimeout(() => setAddedProductId(null), 1400);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
        {products.map(product => {
          const category = resolveProductCategory(product, categoryMap);
          const productPath = getCanonicalProductPath(product, categoryMap);
          const safeImages = product.images
            .map(getSafeCatalogImageUrl)
            .filter((image): image is string => Boolean(image));
          const coverImage = safeImages[0] || "/hero-jewelry.png";
          const alternateImage = safeImages[1];
          const cartQuantity = items.find(item => item.product.id === product.id)?.quantity ?? 0;
          const remaining = Math.max(0, product.stock_quantity - cartQuantity);
          const soldOut = product.stock_quantity < 1;
          const limitReached = !soldOut && remaining < 1;
          const isAdded = addedProductId === product.id;
          const media = (
            <div className="relative aspect-[4/5] overflow-hidden bg-[#eee2d0]">
              <Image
                src={coverImage}
                alt={`${product.title}${category ? ` from the ${category.name} collection` : ""}`}
                fill
                sizes="(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw"
                className="object-cover transition duration-500 group-hover:scale-[1.035]"
              />
              {alternateImage ? (
                <Image
                  src={alternateImage}
                  alt=""
                  fill
                  sizes="(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw"
                  className="product-card-secondary object-cover opacity-0 transition duration-500"
                  aria-hidden
                />
              ) : null}
              <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5 md:left-3 md:top-3">
                {soldOut ? (
                  <span className="rounded-full bg-[#111111]/88 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                    Sold out
                  </span>
                ) : product.stock_quantity <= 3 ? (
                  <span className="rounded-full bg-[#fff8ed]/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-bronze shadow-sm">
                    Low stock
                  </span>
                ) : null}
                {product.is_featured ? (
                  <span className="rounded-full bg-[#c49d52]/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#111111] shadow-sm">
                    Featured
                  </span>
                ) : null}
              </div>
            </div>
          );

          return (
            <article
              key={product.id}
              className={`group min-w-0 overflow-hidden rounded-[1.25rem] border border-border/60 bg-white/88 shadow-card transition hover:-translate-y-1 hover:shadow-luxe md:rounded-[1.5rem] ${
                soldOut ? "opacity-70" : ""
              }`}
            >
              {productPath ? (
                <Link href={productPath} className="block" aria-label={`View ${product.title}`}>
                  {media}
                </Link>
              ) : media}

              <div className={`flex flex-col ${mode === "compact" ? "p-3" : "p-3 md:p-4"}`}>
                {productPath ? (
                  <Link href={productPath} className="block min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-bronze md:text-xs">
                      {category?.name}
                    </p>
                    <h3 className="mt-1 line-clamp-2 min-h-[2.5rem] font-serif text-lg leading-5 text-ink md:min-h-[3rem] md:text-xl md:leading-6">
                      {product.title}
                    </h3>
                  </Link>
                ) : (
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Category unavailable</p>
                    <h3 className="mt-1 line-clamp-2 min-h-[2.5rem] font-serif text-lg leading-5 text-ink md:min-h-[3rem] md:text-xl md:leading-6">
                      {product.title}
                    </h3>
                  </div>
                )}
                <p className="mt-2 truncate text-sm font-semibold text-ink md:text-base">
                  {formatCurrency(product.price)}
                </p>
                <button
                  type="button"
                  onClick={() => handleAddToCart(product)}
                  disabled={soldOut || limitReached || isAdded}
                  className={`mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full px-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition md:gap-2 md:px-4 md:text-xs md:tracking-[0.12em] ${
                    isAdded
                      ? "bg-emerald-700 text-white"
                      : "border border-border bg-white text-ink hover:border-ink hover:bg-[#111111] hover:text-white disabled:border-transparent disabled:bg-sand/60 disabled:text-muted"
                  }`}
                >
                  {isAdded ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden />}
                  {soldOut ? "Sold out" : limitReached ? "Limit reached" : isAdded ? "Added" : "Add to cart"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{status}</p>
    </>
  );
}
