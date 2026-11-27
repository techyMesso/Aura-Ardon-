"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, Star } from "lucide-react";

import {
  DEFAULT_PRODUCT_BLUR_DATA_URL,
  formatKES,
  PriceKES
} from "@/components/storefront/price-kes";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import { useCart } from "@/lib/cart";
import {
  formatProductTitle,
  getSafeCatalogImageUrl,
  productHref
} from "@/lib/catalog";
import { isProductOnSale } from "@/lib/discounts";
import { resolveProductImageAlt } from "@/lib/image-processing";
import { getProductCardAvailability } from "@/lib/product-card";
import type { Product } from "@/lib/types";

interface ProductTileProps {
  product: Product;
  priority?: boolean;
  sizes?: string;
  onStatusChange?: (message: string) => void;
}

export function ProductTile({
  product,
  priority = false,
  sizes = "(max-width: 1023px) 50vw, 25vw",
  onStatusChange
}: ProductTileProps) {
  const router = useRouter();
  const { addItem, items } = useCart();
  const { isWishlisted, toggleWishlist, openCart } = useStorefrontUI();
  const [justAdded, setJustAdded] = useState(false);

  const href = productHref(product);
  const displayTitle = formatProductTitle(product.title);
  const activeVariants = (product.variants ?? []).filter(v => v.active);
  const hasVariants = activeVariants.length > 0;
  const effectiveStock = hasVariants
    ? activeVariants.reduce((sum, v) => sum + v.stock_quantity, 0)
    : product.stock_quantity;

  const safeImages = product.images
    .map(getSafeCatalogImageUrl)
    .filter((image): image is string => Boolean(image));
  const coverImage = safeImages[0] || "/hero-jewelry.png";
  const secondImage = safeImages[1];
  const coverAlt = resolveProductImageAlt(product, 0);

  const cartQuantity = items
    .filter(item => item.product.id === product.id && !item.variant)
    .reduce((sum, item) => sum + item.quantity, 0);
  const availability = getProductCardAvailability(
    { ...product, stock_quantity: effectiveStock },
    hasVariants ? 0 : cartQuantity
  );
  const wishlisted = isWishlisted(product.id);
  const lowStock =
    !availability.soldOut && effectiveStock > 0 && effectiveStock <= 3;
  const onSale = isProductOnSale(product);

  function handleAddToBag() {
    if (hasVariants) {
      router.push(href);
      return;
    }
    if (availability.disabled) return;
    addItem(product, 1);
    setJustAdded(true);
    onStatusChange?.(`${displayTitle} added to bag.`);
    openCart();
    window.setTimeout(() => setJustAdded(false), 1200);
  }

  function handleNavigate(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    const docWithTransition = document as Document & {
      startViewTransition?: (callback: () => void) => void;
    };
    if (
      typeof docWithTransition.startViewTransition === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      event.preventDefault();
      docWithTransition.startViewTransition(() => {
        router.push(href);
      });
    }
  }

  return (
    <article className="group relative flex min-w-0 flex-col rounded-none bg-paper">
      <Link
        href={href}
        onClick={handleNavigate}
        className="flex flex-1 cursor-pointer flex-col"
      >
        <div
          className="relative aspect-square w-full overflow-hidden rounded-none bg-paper"
          style={{ viewTransitionName: `product-image-${product.id}` }}
        >
          <Image
            src={coverImage}
            alt={coverAlt}
            fill
            priority={priority}
            loading={priority ? undefined : "lazy"}
            placeholder="blur"
            blurDataURL={product.blur_data_url || DEFAULT_PRODUCT_BLUR_DATA_URL}
            sizes={sizes}
            className="object-cover object-center"
          />
          {secondImage ? (
            <Image
              src={secondImage}
              alt=""
              fill
              loading="lazy"
              sizes={sizes}
              className="product-card-secondary object-cover object-center opacity-0 transition-opacity duration-200"
              aria-hidden="true"
            />
          ) : null}
          {onSale ? (
            <span className="absolute left-2.5 top-2.5 z-10 rounded-[2px] bg-brass px-2 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
              Sale
            </span>
          ) : null}
        </div>

        <div className="flex flex-col pt-2.5">
          <h3 className="line-clamp-1 font-sans text-[0.95rem] leading-[1.4] text-text transition-colors group-hover:text-price">
            {displayTitle}
          </h3>

          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <PriceKES amount={product.price} />
              {onSale && product.compare_at_price ? (
                <span className="font-sans text-[12px] text-muted line-through">
                  {formatKES(product.compare_at_price)}
                </span>
              ) : null}
            </div>
            {lowStock ? (
              <span className="font-sans text-[12px] leading-[1.5] text-muted">
                Low stock
              </span>
            ) : availability.soldOut ? (
              <span className="font-sans text-[12px] leading-[1.5] text-muted">
                Out of stock
              </span>
            ) : hasVariants ? (
              <span className="font-sans text-[12px] leading-[1.5] text-muted">
                {activeVariants.length} options
              </span>
            ) : null}
          </div>

          {(product.review_count ?? 0) > 0 && product.review_rating_avg != null ? (
            <div
              className="mt-1 flex items-center gap-1 font-sans text-[12px] text-text"
              aria-label={`Rated ${product.review_rating_avg.toFixed(1)} out of 5 from ${product.review_count} ${
                product.review_count === 1 ? "review" : "reviews"
              }`}
            >
              <Star className="h-3.5 w-3.5 fill-brass text-brass" aria-hidden />
              <span>{product.review_rating_avg.toFixed(1)}</span>
              <span className="text-muted">({product.review_count})</span>
            </div>
          ) : null}
        </div>
      </Link>

      <button
        type="button"
        onClick={() => toggleWishlist(product.id)}
        aria-label={
          wishlisted
            ? `Remove ${displayTitle} from wishlist`
            : `Save ${displayTitle} to wishlist`
        }
        aria-pressed={wishlisted}
        className="absolute right-2.5 top-2.5 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-[2px] bg-paper/85 text-text transition-colors hover:text-price"
      >
        <Heart
          className={`h-4 w-4 ${
            wishlisted ? "fill-brass text-brass" : "text-text"
          }`}
          aria-hidden
        />
      </button>

      <div className="mt-2 pt-1">
        <button
          type="button"
          onClick={handleAddToBag}
          disabled={!hasVariants && availability.disabled}
          className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-[2px] border border-text/25 bg-paper px-3 py-1.5 font-sans text-[14px] leading-[1.5] text-text transition-opacity duration-150 hover:border-price hover:text-price disabled:cursor-not-allowed disabled:opacity-45 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          {hasVariants
            ? availability.soldOut
              ? "Out of stock — view options"
              : "Select option"
            : justAdded
              ? "Added to bag"
              : availability.soldOut
                ? "Out of stock"
                : availability.disabled
                  ? "Bag limit reached"
                  : "Add to bag"}
        </button>
      </div>
    </article>
  );
}
