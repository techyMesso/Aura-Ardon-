"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

import {
  DEFAULT_PRODUCT_BLUR_DATA_URL,
  PriceKES
} from "@/components/storefront/price-kes";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import { getSafeCatalogImageUrl, productHref } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
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
  const [swappedOnTouch, setSwappedOnTouch] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const href = productHref(product);
  const safeImages = product.images
    .map(getSafeCatalogImageUrl)
    .filter((image): image is string => Boolean(image));
  const coverImage = safeImages[0] || "/hero-jewelry.png";
  const secondImage = safeImages[1];
  const cartQuantity =
    items.find(item => item.product.id === product.id)?.quantity ?? 0;
  const availability = getProductCardAvailability(product, cartQuantity);
  const wishlisted = isWishlisted(product.id);
  const lowStock =
    !availability.soldOut &&
    product.stock_quantity > 0 &&
    product.stock_quantity <= 3;

  function handleAddToBag() {
    if (availability.disabled) return;
    addItem(product, 1);
    setJustAdded(true);
    onStatusChange?.(`${product.title} added to bag.`);
    openCart();
    window.setTimeout(() => setJustAdded(false), 1200);
  }

  function handleNavigate(event: React.MouseEvent<HTMLAnchorElement>) {
    // On touch devices with a second image, first tap reveals the second photo
    if (
      secondImage &&
      !swappedOnTouch &&
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches
    ) {
      event.preventDefault();
      setSwappedOnTouch(true);
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
            alt={product.title}
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
              className={`product-card-secondary object-cover object-center transition-opacity duration-200 ${
                swappedOnTouch ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden
            />
          ) : null}
        </div>

        <div className="flex flex-col pt-2.5">
          <h3 className="line-clamp-1 font-sans text-[14px] leading-[1.5] text-text transition-colors group-hover:text-brass">
            {product.title}
          </h3>

          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <PriceKES amount={product.price} />
            {lowStock ? (
              <span className="font-sans text-[12px] leading-[1.5] text-muted">
                Low stock
              </span>
            ) : availability.soldOut ? (
              <span className="font-sans text-[12px] leading-[1.5] text-muted">
                Out of stock
              </span>
            ) : null}
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => toggleWishlist(product.id)}
        aria-label={
          wishlisted
            ? `Remove ${product.title} from wishlist`
            : `Save ${product.title} to wishlist`
        }
        aria-pressed={wishlisted}
        className="absolute right-2.5 top-2.5 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-[2px] bg-paper/85 text-text transition-colors hover:text-brass"
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
          disabled={availability.disabled}
          className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-[2px] border border-text/25 bg-paper px-3 py-1.5 font-sans text-[14px] leading-[1.5] text-text transition-opacity duration-150 hover:border-brass hover:text-brass disabled:cursor-not-allowed disabled:opacity-45 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          {justAdded
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
