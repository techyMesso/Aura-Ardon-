"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Heart,
  Minus,
  Plus,
  RotateCcw,
  Star,
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
import { getCartItemKey, useCart } from "@/lib/cart";
import {
  formatProductTitle,
  getSafeCatalogImageUrl,
  productHref
} from "@/lib/catalog";
import { resolveProductImageAlt } from "@/lib/image-processing";
import { trackStorefrontEvent } from "@/lib/events-client";
import type { ProductReviewAggregate } from "@/lib/seo";
import { resolveSiteUrl } from "@/lib/site";
import type {
  Category,
  Product,
  ProductVariant,
  PublicProductReview
} from "@/lib/types";
import { createWhatsAppLink } from "@/lib/utils";

interface ProductDetailClientProps {
  product: Product;
  category: Category | null;
  productUrl: string | null;
  whatsappNumber: string | null;
  approvedReviews?: PublicProductReview[];
  reviewStats?: ProductReviewAggregate | null;
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
  whatsappNumber,
  approvedReviews = [],
  reviewStats = null
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
  const activeVariants = useMemo(
    () => (product.variants ?? []).filter(v => v.active),
    [product.variants]
  );
  const hasVariants = activeVariants.length > 0;

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => {
    if (!activeVariants.length) return null;
    const firstInStock = activeVariants.find(v => v.stock_quantity > 0);
    return (firstInStock ?? activeVariants[0]).id;
  });

  const selectedVariant: ProductVariant | null = useMemo(() => {
    if (!hasVariants) return null;
    return (
      activeVariants.find(v => v.id === selectedVariantId) ??
      activeVariants[0] ??
      null
    );
  }, [activeVariants, hasVariants, selectedVariantId]);

  const gallerySlides = useMemo(() => {
    const slides: Array<{ src: string; alt: string }> = [];
    const seen = new Set<string>();

    const variantImg = getSafeCatalogImageUrl(selectedVariant?.image_url);
    if (variantImg && !seen.has(variantImg)) {
      seen.add(variantImg);
      slides.push({
        src: variantImg,
        alt:
          selectedVariant?.image_alt?.trim() ||
          `${displayTitle} — ${selectedVariant?.name ?? "option"}`
      });
    }

    product.images.forEach((rawUrl, index) => {
      const safe = getSafeCatalogImageUrl(rawUrl);
      if (safe && !seen.has(safe)) {
        seen.add(safe);
        slides.push({
          src: safe,
          alt: resolveProductImageAlt(product, index)
        });
      }
    });

    if (slides.length === 0) {
      slides.push({
        src: "/hero-jewelry.png",
        alt: resolveProductImageAlt(product, 0)
      });
    }

    return slides;
  }, [displayTitle, product, selectedVariant]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState("");

  // Back-in-stock waitlist form state
  const [alertPhone, setAlertPhone] = useState("");
  const [alertName, setAlertName] = useState("");
  const [alertWebsite, setAlertWebsite] = useState("");
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mainImageButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const didSwipeRef = useRef(false);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  const panStartRef = useRef<{
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);

  const effectivePrice = Number(
    selectedVariant?.price_override ?? product.price
  );
  const effectiveCompareAt =
    selectedVariant?.compare_at_price != null
      ? Number(selectedVariant.compare_at_price)
      : product.compare_at_price != null
        ? Number(product.compare_at_price)
        : null;
  const onSale =
    effectiveCompareAt !== null &&
    Number.isFinite(effectiveCompareAt) &&
    effectiveCompareAt > effectivePrice;

  const effectiveStock = selectedVariant
    ? selectedVariant.stock_quantity
    : product.stock_quantity;

  const activeCartKey = getCartItemKey(product.id, selectedVariant?.id);
  const quantityInCart =
    items.find(
      item => getCartItemKey(item.product.id, item.variant?.id) === activeCartKey
    )?.quantity ?? 0;
  const remaining = Math.max(0, effectiveStock - quantityInCart);
  const soldOut = effectiveStock < 1;
  const lowStock = !soldOut && effectiveStock <= 3;
  const wishlisted = isWishlisted(product.id);

  const effectiveWhatsAppNumber =
    storeSettings.whatsappNumber ||
    whatsappNumber ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    "";
  const effectiveProductUrl =
    productUrl || `${resolveSiteUrl()}${productHref(product)}`;

  const askLabel = selectedVariant
    ? `${displayTitle} (${selectedVariant.name})`
    : displayTitle;

  const askMessage = [
    `Hi Auro Ardon! I have a question about ${askLabel} (${formatKES(effectivePrice)}).`,
    `Link: ${effectiveProductUrl}`
  ].join("\n");

  const askWhatsAppUrl = createWhatsAppLink(effectiveWhatsAppNumber, askMessage);

  const specRows = [
    ...(selectedVariant
      ? [{ label: "Selected option", value: `${selectedVariant.name} (${selectedVariant.sku})` }]
      : []),
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
    trackStorefrontEvent("product_view", {
      productId: product.id,
      path: productHref(product)
    });
  }, [product, recordRecentlyViewed]);

  useEffect(() => {
    setSelectedIndex(0);
    setAlertFeedback(null);
  }, [selectedVariantId]);

  useEffect(() => {
    if (remaining > 0 && quantity > remaining) {
      setQuantity(remaining);
    } else if (remaining > 0 && quantity < 1) {
      setQuantity(1);
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
        setSelectedIndex(current => (current + 1) % gallerySlides.length);
      }
      if (event.key === "ArrowLeft") {
        setZoomScale(1);
        setSelectedIndex(
          current => (current - 1 + gallerySlides.length) % gallerySlides.length
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
  }, [gallerySlides.length, lightboxOpen]);

  function handleAddToBag() {
    if (remaining < 1) return;
    const amount = Math.min(quantity, remaining);
    addItem(product, amount, selectedVariant);
    trackStorefrontEvent("add_to_bag", {
      productId: product.id,
      path: productHref(product)
    });
    setStatus(`${askLabel} added to bag.`);
    openCart();
  }

  async function handleWaitlistSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (alertSubmitting) return;
    setAlertSubmitting(true);
    setAlertFeedback(null);

    try {
      const response = await fetch("/api/back-in-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          variantId: selectedVariant?.id ?? null,
          phone: alertPhone.trim(),
          customerName: alertName.trim() || null,
          website: alertWebsite
        })
      });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok || !data.ok) {
        setAlertFeedback({
          ok: false,
          message: data.error || "Unable to save your WhatsApp alert."
        });
        return;
      }
      setAlertFeedback({
        ok: true,
        message:
          data.message ||
          "You're on the waitlist! We'll message you on WhatsApp as soon as it's restocked."
      });
      setAlertPhone("");
      setAlertName("");
    } catch {
      setAlertFeedback({
        ok: false,
        message: "Unable to save your WhatsApp alert right now. Please try again."
      });
    } finally {
      setAlertSubmitting(false);
    }
  }

  function showPrevious() {
    setZoomScale(1);
    setSelectedIndex(
      current => (current - 1 + gallerySlides.length) % gallerySlides.length
    );
  }

  function showNext() {
    setZoomScale(1);
    setSelectedIndex(current => (current + 1) % gallerySlides.length);
  }

  function handleGalleryTouchEnd(event: React.TouchEvent<HTMLButtonElement>) {
    if (touchStartX.current === null || gallerySlides.length < 2) return;
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
        x: Math.max(
          -maxOffset,
          Math.min(maxOffset, panStartRef.current.originX + dx)
        ),
        y: Math.max(
          -maxOffset,
          Math.min(maxOffset, panStartRef.current.originY + dy)
        )
      });
    }
  }

  function handleLightboxTouchEnd() {
    pinchStartDistRef.current = null;
    panStartRef.current = null;
  }

  const activeSlide = gallerySlides[selectedIndex] ?? gallerySlides[0];
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
              src={activeSlide.src}
              alt={activeSlide.alt}
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

          {gallerySlides.length > 1 ? (
            <div
              className="no-scrollbar mt-3 flex gap-2 overflow-x-auto"
              aria-label="Product thumbnails"
            >
              {gallerySlides.map((slide, index) => (
                <button
                  key={`${slide.src}-${index}`}
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
                    src={slide.src}
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
            <PriceKES amount={effectivePrice} className="text-[18px]" />
            {onSale && effectiveCompareAt !== null ? (
              <>
                <span className="font-sans text-[15px] text-muted line-through">
                  {formatKES(effectiveCompareAt)}
                </span>
                <span className="rounded-[2px] bg-brass px-2 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
                  Sale
                </span>
              </>
            ) : null}
            {lowStock ? (
              <span className="font-sans text-[14px] text-muted">
                Low stock ({effectiveStock} left)
              </span>
            ) : soldOut ? (
              <span className="font-sans text-[14px] text-muted">
                Out of stock
              </span>
            ) : null}
          </div>

          {reviewStats && reviewStats.reviewCount > 0 ? (
            <a
              href="#reviews"
              className="mt-2 inline-flex w-fit items-center gap-1.5 font-sans text-[13px] text-text transition-colors hover:text-brass"
            >
              <Star className="h-4 w-4 fill-brass text-brass" aria-hidden />
              <span className="font-medium">
                {reviewStats.ratingValue.toFixed(1)}
              </span>
              <span className="text-muted underline underline-offset-4">
                ({reviewStats.reviewCount}{" "}
                {reviewStats.reviewCount === 1
                  ? "verified review"
                  : "verified reviews"}
                )
              </span>
            </a>
          ) : null}

          {hasVariants ? (
            <div className="mt-5 space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-sans text-[13px] font-medium uppercase tracking-[0.12em] text-muted">
                  Option
                </p>
                {selectedVariant ? (
                  <span className="font-sans text-[13px] text-text">
                    {selectedVariant.name}
                    {selectedVariant.stock_quantity < 1 ? " — Out of stock" : ""}
                  </span>
                ) : null}
              </div>
              <div
                role="radiogroup"
                aria-label="Choose product option"
                className="flex flex-wrap gap-2"
              >
                {activeVariants.map(variant => {
                  const isSelected = selectedVariant?.id === variant.id;
                  const variantOos = variant.stock_quantity < 1;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[2px] border px-3.5 py-2 font-sans text-[13px] transition ${
                        isSelected
                          ? "border-brass bg-stone font-semibold text-text ring-1 ring-brass"
                          : "border-text/20 bg-paper text-text hover:border-brass/70"
                      } ${variantOos ? "opacity-65" : ""}`}
                    >
                      <span className={variantOos ? "line-through" : ""}>
                        {variant.name}
                      </span>
                      {variant.price_override &&
                      Number(variant.price_override) !== Number(product.price) ? (
                        <span className="text-[12px] text-muted">
                          {formatKES(variant.price_override)}
                        </span>
                      ) : null}
                      {variantOos ? (
                        <span className="text-[11px] uppercase tracking-wider text-muted">
                          Sold out
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

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
                    onClick={() =>
                      setQuantity(current => Math.max(1, current - 1))
                    }
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
            ) : (
              <div className="space-y-3 border border-brass/35 bg-stone p-4">
                <div className="flex items-start gap-2.5">
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-brass" aria-hidden />
                  <div>
                    <p className="font-sans text-[14px] font-medium text-text">
                      Notify me on WhatsApp when back in stock
                    </p>
                    <p className="mt-0.5 font-sans text-[12px] text-muted">
                      Leave your WhatsApp number for {askLabel} and we&apos;ll message you first when it arrives.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleWaitlistSubmit} className="space-y-2.5" noValidate>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
                  >
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={alertWebsite}
                      onChange={e => setAlertWebsite(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="tel"
                      inputMode="tel"
                      required
                      aria-label="WhatsApp phone number"
                      placeholder="0712 345 678 or +254..."
                      value={alertPhone}
                      onChange={e => setAlertPhone(e.target.value)}
                      className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 font-sans text-[14px] text-text placeholder:text-muted focus:border-brass focus:outline-none"
                    />
                    <input
                      type="text"
                      aria-label="Your name (optional)"
                      placeholder="Your name (optional)"
                      value={alertName}
                      onChange={e => setAlertName(e.target.value)}
                      className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 font-sans text-[14px] text-text placeholder:text-muted focus:border-brass focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={alertSubmitting || !alertPhone.trim()}
                    className="btn-primary w-full"
                  >
                    {alertSubmitting ? "Saving..." : "Notify me on WhatsApp"}
                  </button>
                </form>

                {alertFeedback ? (
                  <p
                    role={alertFeedback.ok ? "status" : "alert"}
                    className={`flex items-start gap-2 font-sans text-[13px] ${
                      alertFeedback.ok
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {alertFeedback.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    ) : null}
                    <span>{alertFeedback.message}</span>
                  </p>
                ) : null}
              </div>
            )}

            {askWhatsAppUrl ? (
              <div>
                <a
                  href={askWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackStorefrontEvent("whatsapp_product_question", {
                      productId: product.id,
                      path: productHref(product)
                    })
                  }
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

      {approvedReviews.length > 0 && reviewStats ? (
        <section
          id="reviews"
          aria-labelledby="verified-reviews-heading"
          className="mt-14 border-t border-text/12 pt-10"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-brass">
                Verified buyers
              </p>
              <h2
                id="verified-reviews-heading"
                className="mt-1 font-serif text-[32px] font-normal leading-[1.0] tracking-[-0.01em] text-text"
              >
                Customer reviews
              </h2>
              <div className="mt-2 flex items-center gap-2 font-sans text-[14px] text-text">
                <span className="inline-flex items-center gap-0.5" aria-hidden>
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${
                        star <= Math.round(reviewStats.ratingValue)
                          ? "fill-brass text-brass"
                          : "text-muted/35"
                      }`}
                    />
                  ))}
                </span>
                <span className="font-medium">
                  {reviewStats.ratingValue.toFixed(1)} out of 5
                </span>
                <span className="text-muted">
                  · {reviewStats.reviewCount}{" "}
                  {reviewStats.reviewCount === 1
                    ? "verified review"
                    : "verified reviews"}
                </span>
              </div>
            </div>

            <Link
              href="/review"
              className="font-sans text-[13px] text-text underline underline-offset-4 hover:text-brass"
            >
              Ordered this piece? Leave a verified review
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {approvedReviews.map(review => (
              <article
                key={review.id}
                className="flex flex-col justify-between gap-4 border border-text/12 bg-paper p-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="inline-flex items-center gap-0.5"
                      aria-label={`Rated ${review.rating} out of 5 stars`}
                    >
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          className={`h-3.5 w-3.5 ${
                            star <= review.rating
                              ? "fill-brass text-brass"
                              : "text-muted/35"
                          }`}
                          aria-hidden
                        />
                      ))}
                    </div>
                    <time
                      dateTime={review.created_at}
                      className="font-sans text-[12px] text-muted"
                    >
                      {new Intl.DateTimeFormat("en-KE", {
                        timeZone: "Africa/Nairobi",
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                      }).format(new Date(review.created_at))}
                    </time>
                  </div>

                  <p className="whitespace-pre-line font-sans text-[14px] leading-[1.6] text-text">
                    {review.comment}
                  </p>

                  {review.photo_url ? (
                    <a
                      href={review.photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative block h-28 w-28 overflow-hidden border border-text/12 bg-stone"
                      aria-label={`Open full review photo by ${review.display_name}`}
                    >
                      <Image
                        src={review.photo_url}
                        alt={`Verified buyer photo by ${review.display_name}`}
                        fill
                        loading="lazy"
                        sizes="112px"
                        className="object-cover"
                      />
                    </a>
                  ) : null}
                </div>

                <footer className="flex items-center justify-between border-t border-text/10 pt-3 font-sans text-[12px]">
                  <span className="font-medium text-text">
                    {review.display_name}
                  </span>
                  <span className="uppercase tracking-[0.12em] text-brass">
                    Verified buyer
                  </span>
                </footer>
              </article>
            ))}
          </div>
        </section>
      ) : null}

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

          {gallerySlides.length > 1 ? (
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
                src={activeSlide.src}
                alt={activeSlide.alt}
                fill
                sizes="100vw"
                className="object-contain"
              />
            </div>
          </div>

          {gallerySlides.length > 1 ? (
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
