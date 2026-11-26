"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Minus,
  Plus,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";

import { DeliveryEstimate } from "@/components/storefront/delivery-estimate";
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
  getSafeCatalogImageUrl,
  productHref
} from "@/lib/catalog";
import { isProductOnSale } from "@/lib/discounts";
import { resolveSiteUrl } from "@/lib/site";
import type { Category, Product } from "@/lib/types";
import { createWhatsAppLink } from "@/lib/utils";

interface ProductDetailClientProps {
  product: Product;
  category: Category | null;
  productUrl: string | null;
  whatsappNumber: string | null;
}

function clampZoom(scale: number) {
  return Math.min(3, Math.max(1, Number(scale.toFixed(2))));
}

function touchDistance(touches: React.TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
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
    recentlyViewedProducts,
    storeSettings
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
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState("");

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mainImageButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const didSwipeRef = useRef(false);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  const quantityInCart =
    items.find(item => item.product.id === product.id)?.quantity ?? 0;
  const remaining = Math.max(0, product.stock_quantity - quantityInCart);
  const soldOut = product.stock_quantity < 1;
  const lowStock = !soldOut && product.stock_quantity <= 3;
  const wishlisted = isWishlisted(product.id);

  const effectiveWhatsAppNumber =
    storeSettings.whatsappNumber ||
    whatsappNumber ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    "";
  const effectiveProductUrl =
    productUrl || `${resolveSiteUrl()}${productHref(product)}`;

  const askMessage = [
    `Hi Auro Ardon! I have a question about ${displayTitle} (${formatKES(product.price)}).`,
    `Link: ${effectiveProductUrl}`
  ].join("\n");

  const notifyMessage = [
    `Hi Auro Ardon! Please notify me on WhatsApp when ${displayTitle} is back in stock.`,
    `Link: ${effectiveProductUrl}`
  ].join("\n");

  const askWhatsAppUrl = createWhatsAppLink(effectiveWhatsAppNumber, askMessage);
  const notifyWhatsAppUrl = createWhatsAppLink(
    effectiveWhatsAppNumber,
    notifyMessage
  );

  // Structured specs — only non-empty fields are rendered
  const specRows = [
    { label: "Dimensions / Case size", value: product.size_label?.trim() },
    { label: "Material", value: product.material?.trim() },
    { label: "Finish", value: product.finish?.trim() },
    { label: "Water resistance", value: product.water_resistance?.trim() },
    { label: "Warranty", value: product.warranty?.trim() },
    { label: "Ingredients", value: product.ingredients?.trim() },
    { label: "Net weight / Volume", value: product.net_weight?.trim() },
    { label: "Expiry / Shelf life", value: product.expiry_info?.trim() },
    { label: "Care", value: product.care?.trim() },
    { label: "In the box", value: product.in_the_box?.trim() }
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  useEffect(() => {
    recordRecentlyViewed(product.id);
  }, [product.id, recordRecentlyViewed]);

  useEffect(() => {
    if (remaining > 0 && quantity > remaining) {
      setQuantity(remaining);
    }
  }, [quantity, remaining]);

  useEffect(() => {
    if (zoomScale <= 1) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [zoomScale]);

  useEffect(() => {
    if (!lightboxOpen) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      return;
    }
    const previousOverflow = document.body.style.overflow;
    const mainImageButton = mainImageButtonRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowRight") {
        setZoomScale(1);
        setSelectedIndex(current => (current + 1) % images.length);
      }
      if (event.key === "ArrowLeft") {
        setZoomScale(1);
        setSelectedIndex(
          current => (current - 1 + images.length) % images.length
        );
      }
      if (event.key === "+" || event.key === "=") {
        setZoomScale(current => clampZoom(current + 0.5));
      }
      if (event.key === "-") {
        setZoomScale(current => clampZoom(current - 0.5));
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
    setZoomScale(1);
    setSelectedIndex(current => (current - 1 + images.length) % images.length);
  }

  function showNext() {
    setZoomScale(1);
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

  function handleLightboxTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2) {
      pinchStartDistRef.current = touchDistance(event.touches);
      pinchStartScaleRef.current = zoomScale;
      panStartRef.current = null;
    } else if (event.touches.length === 1 && zoomScale > 1) {
      panStartRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        originX: panOffset.x,
        originY: panOffset.y
      };
    }
  }

  function handleLightboxTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2 && pinchStartDistRef.current) {
      const nextDist = touchDistance(event.touches);
      const ratio = nextDist / pinchStartDistRef.current;
      setZoomScale(clampZoom(pinchStartScaleRef.current * ratio));
      return;
    }

    if (event.touches.length === 1 && panStartRef.current && zoomScale > 1) {
      const dx = event.touches[0].clientX - panStartRef.current.x;
      const dy = event.touches[0].clientY - panStartRef.current.y;
      const maxOffset = (zoomScale - 1) * 160;
      setPanOffset({
        x: Math.max(-maxOffset, Math.min(maxOffset, panStartRef.current.originX + dx)),
        y: Math.max(-maxOffset, Math.min(maxOffset, panStartRef.current.originY + dy))
      });
    }
  }

  function handleLightboxTouchEnd() {
    pinchStartDistRef.current = null;
    panStartRef.current = null;
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
            className="relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-none border border-text/10 bg-stone [touch-action:pinch-zoom]"
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
              className="object-contain p-2 sm:p-4"
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
                  aria-label={`View photo ${index + 1} of ${displayTitle}`}
                  aria-pressed={selectedIndex === index}
                  className={`relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-none border border-text/10 bg-stone ${
                    selectedIndex === index
                      ? "ring-2 ring-brass"
                      : "opacity-75 hover:opacity-100"
                  }`}
                >
                  <Image
                    src={image}
                    alt=""
                    aria-hidden="true"
                    fill
                    loading="lazy"
                    sizes="80px"
                    className="object-contain p-1"
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

          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <PriceKES amount={product.price} className="text-[18px]" />
            {isProductOnSale(product) && product.compare_at_price ? (
              <>
                <span className="font-sans text-[15px] text-muted line-through">
                  {formatKES(product.compare_at_price)}
                </span>
                <span className="rounded-[2px] bg-brass px-2 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
                  Sale
                </span>
              </>
            ) : null}
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

            <DeliveryEstimate
              sameDayCutoff={storeSettings.sameDayCutoff}
              businessHours={storeSettings.businessHours}
              isStoreOpen={storeSettings.isStoreOpen}
              holidayBannerMessage={storeSettings.holidayBannerMessage}
            />

            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {status}
            </p>
          </div>

          {specRows.length > 0 ? (
            <dl className="mt-8 divide-y divide-text/12 border-y border-text/12 font-sans text-[14px] leading-[1.5]">
              {specRows.map(row => (
                <div
                  key={row.label}
                  className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[170px_1fr] sm:gap-4"
                >
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="text-text">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
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
          aria-label={`${displayTitle} zoom viewer`}
          onWheel={event => {
            event.preventDefault();
            setZoomScale(current => clampZoom(current - event.deltaY * 0.002));
          }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/95 p-4"
        >
          <div className="absolute left-4 top-4 z-10 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoomScale(current => clampZoom(current - 0.5))}
              disabled={zoomScale <= 1}
              aria-label="Zoom out"
              className="flex h-10 w-10 items-center justify-center rounded-[2px] bg-paper text-text disabled:opacity-40"
            >
              <ZoomOut className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setZoomScale(current => clampZoom(current + 0.5))}
              disabled={zoomScale >= 3}
              aria-label="Zoom in"
              className="flex h-10 w-10 items-center justify-center rounded-[2px] bg-paper text-text disabled:opacity-40"
            >
              <ZoomIn className="h-4 w-4" aria-hidden />
            </button>
            {zoomScale > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                aria-label="Reset zoom"
                className="flex h-10 items-center gap-1 rounded-[2px] bg-paper px-2.5 text-xs font-medium text-text"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {Math.round(zoomScale * 100)}%
              </button>
            ) : null}
          </div>

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
            onClick={() => setZoomScale(current => (current > 1 ? 1 : 2))}
            onTouchStart={handleLightboxTouchStart}
            onTouchMove={handleLightboxTouchMove}
            onTouchEnd={handleLightboxTouchEnd}
            className="relative h-full max-h-[85vh] w-full max-w-4xl cursor-zoom-in overflow-hidden touch-none select-none"
          >
            <div
              className="relative h-full w-full transition-transform duration-100 ease-out"
              style={{
                transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`
              }}
            >
              <Image
                src={images[selectedIndex]}
                alt={`${displayTitle}, enlarged photo ${selectedIndex + 1}`}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
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
