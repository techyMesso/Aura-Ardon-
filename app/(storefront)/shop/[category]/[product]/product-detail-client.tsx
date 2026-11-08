"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Heart, Minus, Plus, X } from "lucide-react";

import {
  DEFAULT_PRODUCT_BLUR_DATA_URL,
  formatKES,
  PriceKES
} from "@/components/storefront/price-kes";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import { useCart } from "@/lib/cart";
import {
  formatProductTitle,
  getSafeCatalogImageUrl
} from "@/lib/catalog";
import { getProductDeliveryLine } from "@/lib/site-config";
import { createWhatsAppLink } from "@/lib/utils";
import type { Category, Product } from "@/lib/types";

interface ProductDetailClientProps {
  product: Product;
  category: Category | null;
  productUrl: string | null;
  whatsappNumber: string | null;
}

export function ProductDetailClient({
  product,
  category,
  productUrl,
  whatsappNumber
}: ProductDetailClientProps) {
  const { addItem, items } = useCart();
  const {
    openCart,
    isWishlisted,
    toggleWishlist,
    recordRecentlyViewed,
    recentlyViewedProducts
  } = useStorefrontUI();

  const displayTitle = formatProductTitle(product.title);
  const safeImages = product.images
    .map(getSafeCatalogImageUrl)
    .filter((image): image is string => Boolean(image));
  const images = safeImages.length ? safeImages : ["/hero-jewelry.png"];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [status, setStatus] = useState("");

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mainImageButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const didSwipeRef = useRef(false);

  const quantityInCart =
    items.find(item => item.product.id === product.id)?.quantity ?? 0;
  const remaining = Math.max(0, product.stock_quantity - quantityInCart);
  const soldOut = product.stock_quantity < 1;
  const lowStock = !soldOut && product.stock_quantity <= 3;
  const wishlisted = isWishlisted(product.id);

  const effectiveWhatsAppNumber =
    whatsappNumber ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

  const askMessage = [
    `Hello Auro Ardon, I have a question about ${displayTitle} (${formatKES(product.price)}).`,
    ...(productUrl ? [`Link: ${productUrl}`] : [])
  ].join("\n");

  const notifyMessage = [
    `Hello Auro Ardon, please notify me when ${displayTitle} is back in stock.`,
    ...(productUrl ? [`Link: ${productUrl}`] : [])
  ].join("\n");

  const askWhatsAppUrl = createWhatsAppLink(effectiveWhatsAppNumber, askMessage);
  const notifyWhatsAppUrl = createWhatsAppLink(
    effectiveWhatsAppNumber,
    notifyMessage
  );

  useEffect(() => {
    recordRecentlyViewed(product.id);
  }, [product.id, recordRecentlyViewed]);

  useEffect(() => {
    if (remaining > 0 && quantity > remaining) {
      setQuantity(remaining);
    }
  }, [quantity, remaining]);

  useEffect(() => {
    if (!lightboxOpen) {
      setZoomScale(1);
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const mainImageButton = mainImageButtonRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowRight") {
        setSelectedIndex(current => (current + 1) % images.length);
      }
      if (event.key === "ArrowLeft") {
        setSelectedIndex(
          current => (current - 1 + images.length) % images.length
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      mainImageButton?.focus();
    };
  }, [images.length, lightboxOpen]);

  function handleAddToBag() {
    if (remaining < 1) return;
    const amount = Math.min(quantity, remaining);
    addItem(product, amount);
    setStatus(`${displayTitle} added to bag.`);
    openCart();
  }

  function showPrevious() {
    setSelectedIndex(current => (current - 1 + images.length) % images.length);
  }

  function showNext() {
    setSelectedIndex(current => (current + 1) % images.length);
  }

  function handleGalleryTouchEnd(event: React.TouchEvent<HTMLButtonElement>) {
    if (touchStartX.current === null || images.length < 2) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 40) return;
    didSwipeRef.current = true;
    if (distance > 0) showPrevious();
    else showNext();
    window.setTimeout(() => {
      didSwipeRef.current = false;
    }, 0);
  }

  const otherRecentlyViewed = recentlyViewedProducts
    .filter(item => item.id !== product.id)
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <nav
        className="mb-6 flex items-center gap-2 font-sans text-[14px] text-muted"
        aria-label="Breadcrumb"
      >
        <Link href="/shop" className="hover:text-text">
          Shop
        </Link>
        {category ? (
          <>
            <span aria-hidden>/</span>
            <Link href={`/shop/${category.slug}`} className="hover:text-text">
              {category.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden>/</span>
        <span className="truncate text-text" aria-current="page">
          {displayTitle}
        </span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        <section
          aria-label={`${displayTitle} gallery`}
          className="lg:sticky lg:top-20 lg:h-fit"
        >
          <button
            ref={mainImageButtonRef}
            type="button"
            onClick={() => {
              if (!didSwipeRef.current) setLightboxOpen(true);
            }}
            onTouchStart={event => {
              touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={handleGalleryTouchEnd}
            className="relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-none bg-paper [touch-action:pinch-zoom]"
            style={{ viewTransitionName: `product-image-${product.id}` }}
            aria-label={`Zoom image of ${displayTitle}`}
          >
            <Image
              src={images[selectedIndex]}
              alt={`${displayTitle}, photo ${selectedIndex + 1} of ${images.length}`}
              fill
              priority
              placeholder="blur"
              blurDataURL={
                product.blur_data_url || DEFAULT_PRODUCT_BLUR_DATA_URL
              }
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </button>

          {images.length > 1 ? (
            <div
              className="no-scrollbar mt-3 flex gap-2 overflow-x-auto"
              aria-label="Product thumbnails"
            >
              {images.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  aria-label={`View photo ${index + 1}`}
                  aria-pressed={selectedIndex === index}
                  className={`relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-none bg-paper ${
                    selectedIndex === index
                      ? "ring-2 ring-brass"
                      : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <Image
                    src={image}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="80px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-serif text-[32px] font-normal leading-[1.05] tracking-[-0.01em] text-text">
              {displayTitle}
            </h1>
            <button
              type="button"
              onClick={() => toggleWishlist(product.id)}
              aria-label={
                wishlisted
                  ? `Remove ${displayTitle} from wishlist`
                  : `Save ${displayTitle} to wishlist`
              }
              aria-pressed={wishlisted}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[2px] border border-text/15 text-text hover:text-brass"
            >
              <Heart
                className={`h-4 w-4 ${
                  wishlisted ? "fill-brass text-brass" : "text-text"
                }`}
                aria-hidden
              />
            </button>
          </div>

          <div className="mt-2 flex items-baseline gap-3">
            <PriceKES amount={product.price} className="text-[18px]" />
            {lowStock ? (
              <span className="font-sans text-[14px] text-muted">
                Low stock ({product.stock_quantity} left)
              </span>
            ) : soldOut ? (
              <span className="font-sans text-[14px] text-muted">
                Out of stock
              </span>
            ) : null}
          </div>

          {product.description ? (
            <p className="mt-5 font-sans text-[16px] leading-[1.5] text-text">
              {product.description}
            </p>
          ) : null}

          <div className="mt-6 space-y-3 border-t border-text/12 pt-6">
            {!soldOut ? (
              <div className="flex items-center gap-3">
                <div className="inline-flex h-11 items-center rounded-[2px] border border-text/20 bg-paper">
                  <button
                    type="button"
                    onClick={() => setQuantity(current => Math.max(1, current - 1))}
                    disabled={quantity <= 1 || remaining < 1}
                    aria-label="Decrease quantity"
                    className="flex h-11 w-10 items-center justify-center text-text hover:text-brass disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" aria-hidden />
                  </button>
                  <output
                    id="product-quantity"
                    className="min-w-8 text-center font-sans text-[14px] text-text"
                    aria-live="polite"
                  >
                    {quantity}
                  </output>
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity(current =>
                        Math.min(current + 1, Math.max(remaining, 1))
                      )
                    }
                    disabled={remaining < 1 || quantity >= remaining}
                    aria-label="Increase quantity"
                    className="flex h-11 w-10 items-center justify-center text-text hover:text-brass disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAddToBag}
                  disabled={remaining < 1}
                  className="btn-primary flex-1"
                >
                  {remaining < 1 ? "Bag limit reached" : "Add to bag"}
                </button>
              </div>
            ) : notifyWhatsAppUrl ? (
              <a
                href={notifyWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full"
              >
                Notify me on WhatsApp
              </a>
            ) : (
              <button type="button" disabled className="btn-primary w-full">
                Out of stock
              </button>
            )}

            {askWhatsAppUrl ? (
              <div>
                <a
                  href={askWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block font-sans text-[14px] leading-[1.5] text-text underline underline-offset-4 hover:text-brass"
                >
                  Ask about this piece on WhatsApp
                </a>
              </div>
            ) : null}

            <p className="pt-1 font-sans text-[14px] leading-[1.5] text-muted">
              {getProductDeliveryLine()}
            </p>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {status}
            </p>
          </div>

          <dl className="mt-8 divide-y divide-text/12 border-y border-text/12 font-sans text-[14px] leading-[1.5]">
            <div className="grid grid-cols-[130px_1fr] gap-4 py-3">
              <dt className="text-muted">Material</dt>
              <dd className="text-text">
                {product.material || "Gold-tone stainless steel"}
              </dd>
            </div>
            <div className="grid grid-cols-[130px_1fr] gap-4 py-3">
              <dt className="text-muted">Finish</dt>
              <dd className="text-text">Tarnish-free polished finish</dd>
            </div>
            <div className="grid grid-cols-[130px_1fr] gap-4 py-3">
              <dt className="text-muted">Length / size</dt>
              <dd className="text-text">Standard fit</dd>
            </div>
            <div className="grid grid-cols-[130px_1fr] gap-4 py-3">
              <dt className="text-muted">Care</dt>
              <dd className="text-text">Wipe dry; keep away from perfume</dd>
            </div>
            <div className="grid grid-cols-[130px_1fr] gap-4 py-3">
              <dt className="text-muted">In the box</dt>
              <dd className="text-text">Auro Ardon pouch and care card</dd>
            </div>
          </dl>
        </section>
      </div>

      {otherRecentlyViewed.length > 0 ? (
        <section className="mt-14 border-t border-text/12 pt-10">
          <h2 className="mb-6 font-serif text-[32px] font-normal leading-[1.0] tracking-[-0.01em] text-text">
            Recently viewed
          </h2>
          <ProductGallery products={otherRecentlyViewed} columns={4} />
        </section>
      ) : null}

      {lightboxOpen ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${product.title} zoom viewer`}
          onWheel={event => {
            event.preventDefault();
            setZoomScale(current =>
              Math.min(2.5, Math.max(1, current - event.deltaY * 0.002))
            );
          }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/95 p-4"
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-[2px] bg-paper text-text"
            aria-label="Close image viewer"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>

          {images.length > 1 ? (
            <button
              type="button"
              onClick={showPrevious}
              className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-[2px] bg-paper text-text"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          ) : null}

          <div
            onClick={() => setZoomScale(current => (current > 1 ? 1 : 1.75))}
            className="relative h-full max-h-[88vh] w-full max-w-4xl cursor-zoom-in overflow-hidden [touch-action:pinch-zoom]"
            style={{ transform: `scale(${zoomScale})` }}
          >
            <Image
              src={images[selectedIndex]}
              alt={`${product.title}, enlarged photo ${selectedIndex + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>

          {images.length > 1 ? (
            <button
              type="button"
              onClick={showNext}
              className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-[2px] bg-paper text-text"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

