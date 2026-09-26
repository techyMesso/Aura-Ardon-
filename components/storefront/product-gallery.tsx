"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, LoaderCircle, ShoppingBag } from "lucide-react";

import {
  createCategoryMap,
  getSafeCatalogImageUrl,
  getCanonicalProductPath
} from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import {
  formatProductCardPrice,
  getProductCardAvailability,
  getProductCategoryLabel
} from "@/lib/product-card";
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
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const categoryMap = createCategoryMap(categories);

  function handleAddToCart(product: Product) {
    const cartQuantity = items.find(item => item.product.id === product.id)?.quantity ?? 0;
    const remaining = Math.max(0, product.stock_quantity - cartQuantity);
    if (remaining < 1) return;

    setAddingProductId(product.id);
    setStatus(`Adding ${product.title} to cart.`);
    window.requestAnimationFrame(() => {
      addItem(product, 1);
      setAddingProductId(null);
      setAddedProductId(product.id);
      setStatus(`${product.title} added to cart.`);
      window.setTimeout(() => setAddedProductId(null), 1400);
    });
  }

  return (
    <>
       <div className="grid grid-cols-2 gap-3 min-[440px]:gap-4 md:gap-5 lg:grid-cols-3 xl:grid-cols-4">
        {products.map(product => {
          const productPath = getCanonicalProductPath(product, categoryMap);
          const categoryLabel = getProductCategoryLabel(product, categoryMap);
          const safeImages = product.images
            .map(getSafeCatalogImageUrl)
            .filter((image): image is string => Boolean(image));
          const coverImage = safeImages[0] || "/hero-jewelry.png";
          const alternateImage = safeImages[1];
          const cartQuantity = items.find(item => item.product.id === product.id)?.quantity ?? 0;
          const availability = getProductCardAvailability(product, cartQuantity);
          const isAdding = addingProductId === product.id;
          const isAdded = addedProductId === product.id;
          const media = (
            <div className="relative aspect-[4/5] overflow-hidden rounded-t-[1.5rem] bg-sand">
              <Image
                src={coverImage}
                alt={`${product.title} jewelry`}
                fill
                sizes="(max-width: 439px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, 25vw"
                className="object-cover object-center transition-transform duration-500 motion-reduce:transition-none md:group-hover:scale-[1.025]"
              />
              {alternateImage ? (
                <Image
                  src={alternateImage}
                  alt=""
                  fill
                  sizes="(max-width: 439px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, 25vw"
                  className="product-card-secondary object-cover object-center opacity-0 transition duration-500"
                  aria-hidden
                />
              ) : null}
              <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5 md:left-3 md:top-3">
                {availability.soldOut ? (
                  <span className="rounded-full bg-ink/88 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                    Out of stock
                  </span>
                ) : availability.lowStock ? (
                  <span className="rounded-full bg-cream/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-bronze shadow-sm">
                    Low stock
                  </span>
                ) : null}
                {product.is_featured ? (
                  <span className="rounded-full bg-bronze/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm">
                    Featured
                  </span>
                ) : null}
              </div>
            </div>
          );

          return (
            <article
              key={product.id}
              className="group flex min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/90 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-luxe"
            >
              {productPath ? (
                <Link href={productPath} className="block" aria-label={`View ${product.title}`}>
                  {media}
                </Link>
              ) : media}

              <div className={`flex flex-1 flex-col ${mode === "compact" ? "p-3" : "p-4"}`}>
                {productPath ? (
                  <Link href={productPath} className="block min-w-0 rounded focus:outline-none focus:ring-2 focus:ring-champagne">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-bronze md:text-xs">
                      {categoryLabel}
                    </p>
                    <h3 className="mt-1 line-clamp-2 min-h-[2.5rem] font-serif text-lg leading-5 text-ink md:min-h-[3rem] md:text-xl md:leading-6">
                      {product.title}
                    </h3>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-bronze transition group-hover:text-rose">
                      View details
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </Link>
                ) : (
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-bronze md:text-xs">{categoryLabel}</p>
                    <h3 className="mt-1 line-clamp-2 min-h-[2.5rem] font-serif text-lg leading-5 text-ink md:min-h-[3rem] md:text-xl md:leading-6">
                      {product.title}
                    </h3>
                  </div>
                )}
                <p className="mt-3 text-base font-semibold text-ink">
                  {formatProductCardPrice(product.price)}
                </p>
                <div className="mt-auto pt-3">
                  <button
                    type="button"
                    onClick={() => handleAddToCart(product)}
                    disabled={availability.disabled || isAdding || isAdded}
                    aria-busy={isAdding}
                    aria-label={`${isAdding ? "Adding" : isAdded ? "Added" : availability.buttonLabel}: ${product.title}`}
                    className={`inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full px-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition md:gap-2 md:px-4 md:text-xs md:tracking-[0.12em] ${
                      isAdded
                        ? "bg-emerald-700 text-white"
                        : "bg-bronze text-white shadow-sm hover:bg-rose disabled:cursor-not-allowed disabled:bg-sand disabled:text-muted"
                    }`}
                  >
                    {isAdding ? (
                      <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : isAdded ? (
                      <Check className="h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    {isAdding ? "Adding..." : isAdded ? "Added" : availability.buttonLabel}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{status}</p>
    </>
  );
}
