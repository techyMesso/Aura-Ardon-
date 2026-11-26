"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { formatKES, PriceKES } from "@/components/storefront/price-kes";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCart, useCartValue } from "@/lib/cart";
import { formatProductTitle } from "@/lib/catalog";
import { SITE_CONFIG } from "@/lib/site-config";
import { normalizeWhatsAppNumber } from "@/lib/utils";

type PaymentMethod = "CASH_ON_DELIVERY" | "WHATSAPP";

interface SavedOrderReceipt {
  orderId: string;
  whatsappUrl: string | null;
  orderStatusToken: string | null;
  trackingUrl: string | null;
  totals: {
    subtotal: string | number;
    shippingFee: string | number;
    total: string | number;
  };
  placedAt: string;
}

const NAIROBI_AREAS = SITE_CONFIG.deliveryAreas;
const LAST_ORDER_STORAGE_KEY = "auro-ardon-last-order";

function isValidKenyanPhone(input: string): boolean {
  const digits = input.replace(/[\s()-]/g, "");
  return /^(?:\+?254|0)?(?:7|1)\d{8}$/.test(digits);
}

function generateIdempotencyKey() {
  return typeof crypto !== "undefined"
    ? crypto.randomUUID()
    : `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CheckoutPageClient() {
  const { items, clearCart, cartNotice } = useCart();
  const { total, itemCount } = useCartValue();
  const { storeSettings } = useStorefrontUI();
  const isStoreOpen = storeSettings.isStoreOpen;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SavedOrderReceipt | null>(null);
  const [trackedStatus, setTrackedStatus] = useState<{
    orderStatus: string;
    paymentStatus: string;
  } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("+254 ");
  const [deliveryArea, setDeliveryArea] = useState<string>(NAIROBI_AREAS[0]);
  const [locationDetail, setLocationDetail] = useState("");
  const [notes, setNotes] = useState("");

  const [isGift, setIsGift] = useState(false);
  const [giftNote, setGiftNote] = useState("");
  const [hidePrices, setHidePrices] = useState(false);

  const whatsappConfigured = Boolean(
    normalizeWhatsAppNumber(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)
  );
  const cartSignature = useMemo(
    () => items.map(item => `${item.product.id}:${item.quantity}`).join("|"),
    [items]
  );
  const idempotencyKeyRef = useRef(generateIdempotencyKey());
  const lastSignatureRef = useRef(cartSignature);
  const submittingRef = useRef(false);

  // Regenerate idempotency key if cart contents change after a failed attempt.
  useEffect(() => {
    if (lastSignatureRef.current !== cartSignature) {
      lastSignatureRef.current = cartSignature;
      idempotencyKeyRef.current = generateIdempotencyKey();
    }
  }, [cartSignature]);

  // Restore last placed order receipt if the customer refreshed or returned from WhatsApp.
  useEffect(() => {
    if (items.length > 0) return;
    try {
      const saved = localStorage.getItem(LAST_ORDER_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as SavedOrderReceipt;
      const ageMs = Date.now() - Date.parse(parsed.placedAt ?? "");
      // Keep recent receipt visible for 24 hours when cart is empty.
      if (parsed.orderId && Number.isFinite(ageMs) && ageMs < 24 * 60 * 60 * 1000) {
        setReceipt(parsed);
      }
    } catch {
      // Ignore storage access errors
    }
  }, [items.length]);

  async function handleCheckOrderStatus() {
    if (!receipt?.orderStatusToken || checkingStatus) return;
    setCheckingStatus(true);
    try {
      const response = await fetch(
        `/api/orders/status/${encodeURIComponent(receipt.orderStatusToken)}`,
        { cache: "no-store" }
      );
      if (response.ok) {
        const data = await response.json();
        setTrackedStatus(data);
      }
    } finally {
      setCheckingStatus(false);
    }
  }

  async function submitCheckout(method: PaymentMethod) {
    if (submittingRef.current || loading) return;

    if (!isStoreOpen) {
      setError(
        storeSettings.holidayBannerMessage.trim() ||
          "Our studio is currently closed for orders. Please check back once we reopen."
      );
      return;
    }

    if (!customerName.trim()) {
      setError("Enter your name.");
      return;
    }

    if (!isValidKenyanPhone(customerPhone)) {
      setError("Enter a valid Kenyan mobile number, e.g. +254 712 345 678 or 0112 345 678.");
      return;
    }

    if (deliveryArea === "Outside Nairobi" && !locationDetail.trim()) {
      setError("Enter your town and delivery landmark or courier point.");
      return;
    }

    const combinedLocation = locationDetail.trim()
      ? `${deliveryArea} — ${locationDetail.trim()}`
      : deliveryArea;

    if (!combinedLocation.trim()) {
      setError("Select your delivery area.");
      return;
    }

    const noteParts: string[] = [];
    if (notes.trim()) {
      noteParts.push(notes.trim());
    }
    if (isGift) {
      const giftHeader = hidePrices
        ? "[Gift order — hide prices on slip]"
        : "[Gift order]";
      noteParts.push(
        giftNote.trim() ? `${giftHeader} Note: ${giftNote.trim()}` : giftHeader
      );
    }
    const combinedNotes = noteParts.join(" | ").slice(0, 1000) || null;

    submittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current
        },
        body: JSON.stringify({
          items: items.map(item => ({
            productId: item.product.id,
            quantity: item.quantity
          })),
          customerName: customerName.trim(),
          customerEmail: null,
          customerPhone: customerPhone.trim(),
          customerLocation: combinedLocation,
          notes: combinedNotes,
          paymentMethod: method
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to place order.");
      }

      const nextReceipt: SavedOrderReceipt = {
        orderId: data.orderId,
        whatsappUrl: data.whatsappUrl ?? null,
        orderStatusToken: data.orderStatusToken ?? null,
        trackingUrl:
          data.orderStatusToken
            ? `/orders/${encodeURIComponent(data.orderStatusToken)}`
            : null,
        totals: {
          subtotal: data.subtotal,
          shippingFee: data.shippingFee,
          total: data.total
        },
        placedAt: new Date().toISOString()
      };

      try {
        localStorage.setItem(LAST_ORDER_STORAGE_KEY, JSON.stringify(nextReceipt));
      } catch {
        // Ignore storage write errors
      }

      clearCart();
      idempotencyKeyRef.current = generateIdempotencyKey();
      setReceipt(nextReceipt);

      if (data.whatsappUrl && method === "WHATSAPP") {
        window.location.href = data.whatsappUrl;
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to place order."
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  if (receipt && items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:py-24">
        <div
          role="status"
          aria-live="polite"
          className="mb-4 inline-block rounded-[2px] bg-stone px-3 py-1 font-sans text-[14px] text-text"
        >
          Order placed — #{receipt.orderId.slice(0, 8).toUpperCase()}
        </div>
        <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
          Order placed
        </h1>

        <div className="mt-5 space-y-1 font-sans text-[16px] leading-[1.5] text-text">
          <p>We have reserved your pieces in our Nairobi studio.</p>
          <p className="text-muted">
            Our dispatch desk will call or message you shortly to confirm rider arrival; you pay on delivery by cash or M-Pesa.
          </p>
        </div>

        <div className="mt-8 divide-y divide-text/12 border-y border-text/12 font-sans text-[14px]">
          <div className="flex justify-between py-3">
            <span className="text-muted">Subtotal</span>
            <span className="text-text">{formatKES(receipt.totals.subtotal)}</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-muted">Delivery</span>
            <span className="text-text">
              {Number(receipt.totals.shippingFee) > 0
                ? formatKES(receipt.totals.shippingFee)
                : "Confirmed on dispatch"}
            </span>
          </div>
          <div className="flex justify-between py-3 font-medium">
            <span className="text-text">Total</span>
            <PriceKES amount={receipt.totals.total} />
          </div>
        </div>

        {trackedStatus ? (
          <div className="mt-6 bg-stone p-4 font-sans text-[14px] text-text">
            <p>
              Order status:{" "}
              {trackedStatus.orderStatus.replace(/_/g, " ").toLowerCase()}
            </p>
            <p className="text-muted">
              Payment: {trackedStatus.paymentStatus.toLowerCase()}
            </p>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-4">
          {receipt.whatsappUrl ? (
            <a
              href={receipt.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              Message us on WhatsApp
            </a>
          ) : null}

          {receipt.trackingUrl ? (
            <Link href={receipt.trackingUrl} className="btn-outline">
              Open order tracking page
            </Link>
          ) : null}

          {receipt.orderStatusToken ? (
            <button
              type="button"
              onClick={() => void handleCheckOrderStatus()}
              disabled={checkingStatus}
              className="cursor-pointer font-sans text-[14px] text-text underline underline-offset-4 hover:text-brass"
            >
              {checkingStatus ? "Checking order..." : "Check status now"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
          Your bag is empty.
        </h1>
        <p className="mt-4 font-sans text-[16px] leading-[1.5] text-muted">
          Add a piece from the catalog before checking out.
        </p>
        <div className="mt-6">
          <Link href="/shop" className="btn-primary">
            Shop new in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        Checkout
      </h1>

      {cartNotice ? (
        <div
          role="status"
          className="mt-6 border border-brass/40 bg-stone px-4 py-3 font-sans text-[14px] text-text"
        >
          {cartNotice}
        </div>
      ) : null}

      <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          onSubmit={event => {
            event.preventDefault();
            void submitCheckout("CASH_ON_DELIVERY");
          }}
          className="space-y-6"
        >
          <div className="space-y-4">
            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">Name</span>
              <Input
                required
                autoComplete="name"
                placeholder="Your full name"
                value={customerName}
                onChange={event => setCustomerName(event.target.value)}
              />
            </label>

            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">Phone</span>
              <Input
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+254 712 345 678"
                value={customerPhone}
                onChange={event => setCustomerPhone(event.target.value)}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-sans text-[14px]">
                <span className="mb-1.5 block text-text">Delivery area</span>
                <select
                  value={deliveryArea}
                  onChange={event => setDeliveryArea(event.target.value)}
                  className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 font-sans text-[14px] text-text focus:border-brass focus:outline-none"
                >
                  {NAIROBI_AREAS.map(area => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block font-sans text-[14px]">
                <span className="mb-1.5 block text-text">
                  {deliveryArea === "Outside Nairobi"
                    ? "Town and pickup point (required)"
                    : "Building, road, or landmark"}
                </span>
                <Input
                  required={deliveryArea === "Outside Nairobi"}
                  autoComplete="street-address"
                  placeholder={
                    deliveryArea === "Outside Nairobi"
                      ? "e.g. Nakuru CBD — Wells Fargo / EasyCoach"
                      : "Apartment, office, or gate"
                  }
                  value={locationDetail}
                  onChange={event => setLocationDetail(event.target.value)}
                />
              </label>
            </div>

            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">Notes (optional)</span>
              <Textarea
                maxLength={800}
                rows={3}
                placeholder="Delivery timing or rider instructions"
                value={notes}
                onChange={event => setNotes(event.target.value)}
              />
            </label>
          </div>

          <div className="border-t border-text/12 pt-5 font-sans text-[14px]">
            <label className="inline-flex cursor-pointer items-center gap-2.5 text-text">
              <input
                type="checkbox"
                checked={isGift}
                onChange={event => setIsGift(event.target.checked)}
                className="h-4 w-4 accent-brass"
              />
              <span>This is a gift</span>
            </label>

            {isGift ? (
              <div className="mt-4 space-y-3 bg-stone p-4">
                <label className="block">
                  <span className="mb-1.5 block text-text">Gift note</span>
                  <Textarea
                    maxLength={300}
                    rows={2}
                    placeholder="Write the message for the gift card"
                    value={giftNote}
                    onChange={event => setGiftNote(event.target.value)}
                  />
                </label>

                <label className="inline-flex cursor-pointer items-center gap-2.5 text-text">
                  <input
                    type="checkbox"
                    checked={hidePrices}
                    onChange={event => setHidePrices(event.target.checked)}
                    className="h-4 w-4 accent-brass"
                  />
                  <span>Hide prices on packing slip</span>
                </label>
              </div>
            ) : null}
          </div>

          <div className="border-t border-text/12 pt-5 font-sans text-[14px]">
            <h2 className="font-medium text-text">Payment</h2>
            <p className="mt-1 text-muted">
              Pay on delivery — cash or M-Pesa.
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 font-sans text-[14px] text-red-600 dark:text-red-400"
            >
              {error}
            </div>
          ) : null}

          {!isStoreOpen ? (
            <div
              role="status"
              className="rounded-[2px] border border-brass/50 bg-stone px-4 py-3 font-sans text-[14px] text-text"
            >
              {storeSettings.holidayBannerMessage.trim() ||
                "Our Nairobi studio is temporarily closed. Browsing stays open, and sending orders will resume when we reopen."}
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 pt-2 sm:flex-row">
            <Button
              type="submit"
              disabled={loading || !isStoreOpen}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Placing order...
                </>
              ) : !isStoreOpen ? (
                "Store temporarily closed"
              ) : (
                "Place order"
              )}
            </Button>

            {whatsappConfigured ? (
              <Button
                type="button"
                variant="secondary"
                disabled={loading || !isStoreOpen}
                onClick={() => void submitCheckout("WHATSAPP")}
                className="flex-1"
              >
                Order on WhatsApp
              </Button>
            ) : null}
          </div>
        </form>

        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="border-t border-text/12 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <h2 className="font-sans text-[14px] font-medium text-text">
              Order summary ({itemCount})
            </h2>

            <ul className="mt-4 divide-y divide-text/10 font-sans text-[14px]">
              {items.map(item => (
                <li
                  key={item.product.id}
                  className="flex items-baseline justify-between gap-4 py-2.5"
                >
                  <span className="truncate text-text">
                    {formatProductTitle(item.product.title)} × {item.quantity}
                  </span>
                  <PriceKES
                    amount={Number(item.product.price) * item.quantity}
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-2 border-t border-text/12 pt-4 font-sans text-[14px]">
              <div className="flex justify-between text-muted">
                <span>Delivery</span>
                <span>Confirmed on dispatch</span>
              </div>
              <div className="flex justify-between pt-2 font-medium text-text">
                <span>Subtotal</span>
                <PriceKES amount={total} />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
