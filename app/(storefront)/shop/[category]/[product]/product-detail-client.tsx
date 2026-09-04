"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Expand,
  MessageCircle,
  Minus,
  Plus,
  ShieldCheck,
  X
} from "lucide-react";

import { useCart } from "@/lib/cart";
import { getSafeCatalogImageUrl } from "@/lib/catalog";
import { createWhatsAppLink, formatCurrency } from "@/lib/utils";
import type { Category, Product } from "@/lib/types";

interface ProductDetailClientProps {
  product: Product;
  category: Category;
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
  const safeImages = product.images
    .map(getSafeCatalogImageUrl)
    .filter((image): image is string => Boolean(image));
  const images = safeImages.length ? safeImages : ["/hero-jewelry.png"];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [status, setStatus] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mainImageButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const quantityInCart = items.find(item => item.product.id === product.id)?.quantity ?? 0;
  const remaining = Math.max(0, product.stock_quantity - quantityInCart);
  const soldOut = product.stock_quantity < 1;
  const stockLabel = soldOut
    ? "Sold out"
    : product.stock_quantity <= 3
      ? "Only a few left"
      : "In stock";
  const whatsappUrl = productUrl && whatsappNumber
    ? createWhatsAppLink(
        whatsappNumber,
        soldOut
          ? [
              "Hello Auro Ardon, please let me know when this piece is restocked:",
              product.title,
              `Product: ${productUrl}`
            ].join("\n")
          : [
              "Hello Auro Ardon, I would like to order:",
              product.title,
              `Quantity: ${quantity}`,
              `Price: ${formatCurrency(product.price)}`,
              `Product: ${productUrl}`
            ].join("\n")
      )
    : null;

  useEffect(() => {
    if (remaining > 0 && quantity > remaining) setQuantity(remaining);
  }, [quantity, remaining]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowRight") {
        setSelectedIndex(current => (current + 1) % images.length);
      }
      if (event.key === "ArrowLeft") {
        setSelectedIndex(current => (current - 1 + images.length) % images.length);
      }
      if (event.key === "Tab") {
        const controls = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)"
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      mainImageButtonRef.current?.focus();
    };
  }, [images.length, lightboxOpen]);

  function increment() {
    setQuantity(current => Math.min(current + 1, Math.max(remaining, 1)));
  }

  function decrement() {
    setQuantity(current => Math.max(1, current - 1));
  }

  function handleAddToCart() {
    if (remaining < 1) return;
    const amount = Math.min(quantity, remaining);
    addItem(product, amount);
    setStatus(`${amount} ${amount === 1 ? "piece" : "pieces"} of ${product.title} added to cart.`);
  }

  function showPrevious() {
    setSelectedIndex(current => (current - 1 + images.length) % images.length);
  }

  function showNext() {
    setSelectedIndex(current => (current + 1) % images.length);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 pb-28 pt-8 md:px-6 lg:px-10 lg:pb-12 lg:pt-12">
      <nav className="mb-6 flex min-w-0 items-center gap-2 overflow-hidden text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/shop" className="shrink-0 hover:text-bronze">Shop</Link>
        <span aria-hidden>/</span>
        <Link href={`/shop/${category.slug}`} className="shrink-0 hover:text-bronze">{category.name}</Link>
        <span aria-hidden>/</span>
        <span className="truncate text-ink" aria-current="page">{product.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
        <section aria-label={`${product.title} images`}>
          <button
            ref={mainImageButtonRef}
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="group relative block aspect-[4/5] w-full overflow-hidden rounded-[1.75rem] bg-[#eee2d0] shadow-card [touch-action:pinch-zoom]"
            aria-label={`Open enlarged image of ${product.title}`}
          >
            <Image
              src={images[selectedIndex]}
              alt={`${product.title}, view ${selectedIndex + 1} of ${images.length}`}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 54vw"
              className="object-cover transition duration-500 group-hover:scale-[1.02]"
            />
            <span className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#111111]/82 text-white backdrop-blur">
              <Expand className="h-4 w-4" aria-hidden />
            </span>
          </button>

          {images.length > 1 ? (
            <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2" aria-label="Choose product image">
              {images.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  aria-label={`Show image ${index + 1}`}
                  aria-pressed={selectedIndex === index}
                  className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition sm:h-24 sm:w-24 ${
                    selectedIndex === index ? "border-[#c49d52]" : "border-transparent"
                  }`}
                >
                  <Image src={image} alt="" fill sizes="96px" className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="lg:sticky lg:top-24 lg:h-fit">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#c49d52]">{category.name}</p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.03] text-ink sm:text-5xl">{product.title}</h1>
          <p className="mt-4 text-2xl font-semibold text-ink">{formatCurrency(product.price)}</p>

          <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-ink">
            <span className={`h-2.5 w-2.5 rounded-full ${soldOut ? "bg-muted" : product.stock_quantity <= 3 ? "bg-amber-600" : "bg-emerald-700"}`} />
            {stockLabel}
          </div>

          {product.description ? (
            <p className="mt-6 text-base leading-7 text-muted">{product.description}</p>
          ) : null}
          {product.material ? (
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border/60 bg-white/70 px-4 py-3 text-sm text-ink">
              <ShieldCheck className="h-4 w-4 shrink-0 text-bronze" aria-hidden />
              <span><span className="font-semibold">Material:</span> {product.material}</span>
            </div>
          ) : null}

          <div className="mt-6 rounded-[1.5rem] border border-border/60 bg-white/80 p-5 shadow-card">
            <label className="block text-sm font-semibold text-ink" htmlFor="product-quantity">Quantity</label>
            <div className="mt-3 inline-flex min-h-12 items-center rounded-full border border-border bg-white p-1">
              <button
                type="button"
                onClick={decrement}
                disabled={quantity <= 1 || remaining < 1}
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-sand/50 disabled:text-muted/40"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <output id="product-quantity" className="min-w-10 text-center font-semibold text-ink" aria-live="polite">{quantity}</output>
              <button
                type="button"
                onClick={increment}
                disabled={remaining < 1 || quantity >= remaining}
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-sand/50 disabled:text-muted/40"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {quantityInCart > 0 ? (
              <p className="mt-2 text-xs text-muted">{quantityInCart} already in your cart.</p>
            ) : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={remaining < 1}
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[#111111] px-5 text-sm font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#29231e] disabled:bg-sand disabled:text-muted"
              >
                <Check className="h-4 w-4" aria-hidden />
                {soldOut ? "Sold out" : remaining < 1 ? "Cart limit reached" : "Add to cart"}
              </button>
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-border bg-white px-5 text-sm font-semibold uppercase tracking-[0.12em] text-ink transition hover:bg-sand/40"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  {soldOut ? "Ask about restock" : "WhatsApp"}
                </a>
              ) : null}
            </div>
            {!whatsappUrl ? (
              <p className="mt-3 text-xs leading-5 text-muted">WhatsApp ordering is unavailable until the store contact number and site URL are configured.</p>
            ) : null}
            <p className="sr-only" aria-live="polite" aria-atomic="true">{status}</p>
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-white/96 px-3 py-2.5 shadow-[0_-8px_30px_rgba(31,23,16,0.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <div className="min-w-0 flex-1 pl-1">
            <p className="truncate text-xs font-semibold text-ink">{product.title}</p>
            <p className="text-sm font-semibold text-bronze">{formatCurrency(product.price)}</p>
          </div>
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={remaining < 1}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#111111] px-4 text-xs font-semibold uppercase tracking-[0.1em] text-white disabled:bg-sand disabled:text-muted"
          >
            {soldOut ? "Sold out" : remaining < 1 ? "Limit reached" : "Add to cart"}
          </button>
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#c49d52] text-[#111111]"
              aria-label={soldOut ? "Ask about this product restock on WhatsApp" : "Order this product via WhatsApp"}
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>

      {lightboxOpen ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${product.title} image viewer`}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-3 sm:p-8"
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6 sm:top-6"
            aria-label="Close image viewer"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          {images.length > 1 ? (
            <button type="button" onClick={showPrevious} className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-6" aria-label="Previous image">
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
          ) : null}
          <div className="relative h-full max-h-[90vh] w-full max-w-5xl [touch-action:pinch-zoom]">
            <Image
              src={images[selectedIndex]}
              alt={`${product.title}, enlarged view ${selectedIndex + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
          {images.length > 1 ? (
            <button type="button" onClick={showNext} className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6" aria-label="Next image">
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
          ) : null}
          <p className="absolute bottom-3 text-xs text-white/70 sm:bottom-6">{selectedIndex + 1} / {images.length}</p>
        </div>
      ) : null}
    </div>
  );
}
