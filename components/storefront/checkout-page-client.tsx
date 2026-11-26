"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Truck } from "lucide-react";

import { formatKES, PriceKES } from "@/components/storefront/price-kes";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getCartItemKey,
  getCartItemUnitPrice,
  useCart,
  useCartValue
} from "@/lib/cart";
import { formatProductTitle } from "@/lib/catalog";
import type { DeliveryZone } from "@/lib/types";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";
import { calculateCheckoutTotals } from "@/lib/whatsapp-order";

interface CheckoutPageClientProps {
  deliveryZones: DeliveryZone[];
  freeDeliveryThreshold: number;
}

function generateIdempotencyKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CheckoutPageClient({
  deliveryZones,
  freeDeliveryThreshold
}: CheckoutPageClientProps) {
  const router = useRouter();
  const { items, clearCart, cartNotice } = useCart();
  const { total: cartSubtotal, itemCount } = useCartValue();
  const { storeSettings } = useStorefrontUI();

  const isStoreOpen = storeSettings.isStoreOpen;
  const activeZones = useMemo(
    () => deliveryZones.filter(zone => zone.active),
    [deliveryZones]
  );

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState<string>(
    activeZones[0]?.id ?? ""
  );
  const [buildingLandmark, setBuildingLandmark] = useState("");
  const [townCounty, setTownCounty] = useState("");
  const [notes, setNotes] = useState("");
  const [isGift, setIsGift] = useState(false);
  const [giftNote, setGiftNote] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    label: string;
    discountAmount: number;
    freeDeliveryApplied: boolean;
  } | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  // Anti-bot honeypot — never shown to human shoppers
  const [website, setWebsite] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedZone = useMemo(
    () =>
      activeZones.find(zone => zone.id === selectedZoneId) ?? activeZones[0] ?? null,
    [activeZones, selectedZoneId]
  );

  const totals = useMemo(
    () =>
      calculateCheckoutTotals({
        subtotal: cartSubtotal,
        zoneFee: selectedZone?.fee ?? 0,
        freeDeliveryThreshold,
        discountAmount: appliedDiscount?.discountAmount ?? 0,
        freeDeliveryFromCode: appliedDiscount?.freeDeliveryApplied ?? false
      }),
    [
      appliedDiscount?.discountAmount,
      appliedDiscount?.freeDeliveryApplied,
      cartSubtotal,
      freeDeliveryThreshold,
      selectedZone?.fee
    ]
  );

  const cartSignature = useMemo(
    () =>
      items
        .map(item => `${getCartItemKey(item.product.id, item.variant?.id)}:${item.quantity}`)
        .join("|") +
      `:${selectedZone?.id ?? ""}:${discountCode.trim().toUpperCase()}`,
    [discountCode, items, selectedZone?.id]
  );

  const idempotencyKeyRef = useRef(generateIdempotencyKey());
  const lastSignatureRef = useRef(cartSignature);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (lastSignatureRef.current !== cartSignature) {
      lastSignatureRef.current = cartSignature;
      idempotencyKeyRef.current = generateIdempotencyKey();
    }
  }, [cartSignature]);

  useEffect(() => {
    if (!selectedZoneId && activeZones[0]?.id) {
      setSelectedZoneId(activeZones[0].id);
    }
  }, [activeZones, selectedZoneId]);

  useEffect(() => {
    // Re-require server validation whenever bag contents or zone change
    if (appliedDiscount) {
      setAppliedDiscount(null);
      setDiscountError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSubtotal, selectedZone?.id]);

  async function handleApplyDiscount() {
    const clean = discountCode.trim().toUpperCase();
    if (!clean || !selectedZone || items.length === 0) {
      setDiscountError("Enter a discount code to apply.");
      return;
    }

    setValidatingCode(true);
    setDiscountError(null);
    try {
      const response = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: clean,
          items: items.map(item => ({
            productId: item.product.id,
            ...(item.variant?.id ? { variantId: item.variant.id } : {}),
            quantity: item.quantity
          })),
          deliveryZoneId: selectedZone.id,
          phone: phone.trim() || null
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        code?: string;
        label?: string;
        discountAmount?: number;
        freeDeliveryApplied?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.code) {
        setAppliedDiscount(null);
        setDiscountError(payload.error ?? "Discount code is not valid.");
        return;
      }

      setDiscountCode(payload.code);
      setAppliedDiscount({
        code: payload.code,
        label: payload.label ?? payload.code,
        discountAmount: Number(payload.discountAmount ?? 0),
        freeDeliveryApplied: Boolean(payload.freeDeliveryApplied)
      });
    } catch {
      setAppliedDiscount(null);
      setDiscountError("Unable to verify discount code right now.");
    } finally {
      setValidatingCode(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || loading) return;

    if (!isStoreOpen) {
      setError(
        storeSettings.holidayBannerMessage.trim() ||
          "Our Nairobi studio is currently closed for orders. Please check back once we reopen."
      );
      return;
    }

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }

    try {
      normalizeKenyanPhoneNumber(phone);
    } catch {
      setError(
        "Enter a valid Kenyan phone number (07XXXXXXXX, 01XXXXXXXX, +2547..., or +2541...)."
      );
      return;
    }

    if (!selectedZone) {
      setError("Select your delivery zone.");
      return;
    }

    if (!buildingLandmark.trim() || buildingLandmark.trim().length < 2) {
      setError("Enter your building, road, or delivery landmark.");
      return;
    }

    if (selectedZone.is_outside_nairobi && !townCounty.trim()) {
      setError("Enter your town or county for deliveries outside Nairobi.");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current
        },
        body: JSON.stringify({
          items: items.map(item => ({
            productId: item.product.id,
            ...(item.variant?.id ? { variantId: item.variant.id } : {}),
            quantity: item.quantity
          })),
          fullName: fullName.trim(),
          phone: phone.trim(),
          deliveryZoneId: selectedZone.id,
          buildingLandmark: buildingLandmark.trim(),
          townCounty: selectedZone.is_outside_nairobi ? townCounty.trim() : null,
          notes: notes.trim() || null,
          isGift,
          giftNote: isGift ? giftNote.trim() || null : null,
          hidePrices: isGift,
          marketingOptIn,
          discountCode: discountCode.trim() || null,
          website
        })
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        orderNumber?: string;
        confirmationPath?: string;
        whatsappUrl?: string | null;
      };

      if (!response.ok || !data.ok || !data.confirmationPath) {
        throw new Error(data.error || "Unable to save your order. Please try again.");
      }

      // Clear cart ONLY after the order has been saved in Postgres
      clearCart();
      idempotencyKeyRef.current = generateIdempotencyKey();

      // Navigate to confirmation page and immediately open WhatsApp via window.location.href
      const launchUrl = `${data.confirmationPath}&launch=1`;
      router.push(launchUrl);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save your order."
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[56px]">
          Your bag is empty.
        </h1>
        <p className="mt-4 font-sans text-[16px] leading-[1.5] text-muted">
          Add a piece from our Nairobi catalog before checking out.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/shop" className="btn-primary">
            Shop new in
          </Link>
          <Link href="/track" className="btn-outline">
            Track an existing order
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[56px]">
        Checkout
      </h1>
      <p className="mt-2 font-sans text-[15px] text-muted">
        Send your order on WhatsApp and pay cash or M-Pesa when it arrives.
      </p>

      {cartNotice ? (
        <div
          role="status"
          className="mt-6 border border-brass/40 bg-stone px-4 py-3 font-sans text-[14px] text-text"
        >
          {cartNotice}
        </div>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_350px] lg:gap-12">
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Hidden anti-bot honeypot */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
          >
            <label>
              Website
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={event => setWebsite(event.target.value)}
              />
            </label>
          </div>

          <div className="space-y-4">
            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">
                Full name <span className="text-brass">*</span>
              </span>
              <Input
                required
                autoComplete="name"
                placeholder="e.g. Amina Wanjiku"
                value={fullName}
                onChange={event => setFullName(event.target.value)}
              />
            </label>

            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">
                WhatsApp / Phone number <span className="text-brass">*</span>
              </span>
              <Input
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0712 345 678 or +254 712 345 678"
                value={phone}
                onChange={event => setPhone(event.target.value)}
              />
            </label>

            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">
                Delivery zone <span className="text-brass">*</span>
              </span>
              <select
                required
                value={selectedZone?.id ?? ""}
                onChange={event => setSelectedZoneId(event.target.value)}
                className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 font-sans text-[14px] text-text focus:border-brass focus:outline-none"
              >
                {activeZones.map(zone => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name} — {formatKES(zone.fee)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">
                Building, road, or landmark <span className="text-brass">*</span>
              </span>
              <Input
                required
                autoComplete="street-address"
                placeholder={
                  selectedZone?.is_outside_nairobi
                    ? "e.g. Courier pickup office or estate landmark"
                    : "e.g. Sarit Centre, 3rd floor, or apartment gate"
                }
                value={buildingLandmark}
                onChange={event => setBuildingLandmark(event.target.value)}
              />
            </label>

            {selectedZone?.is_outside_nairobi ? (
              <label className="block font-sans text-[14px]">
                <span className="mb-1.5 block text-text">
                  Town / County <span className="text-brass">*</span>
                </span>
                <Input
                  required
                  placeholder="e.g. Nakuru, Kisumu, Mombasa, Eldoret"
                  value={townCounty}
                  onChange={event => setTownCounty(event.target.value)}
                />
              </label>
            ) : null}

            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">Notes (optional)</span>
              <Textarea
                maxLength={600}
                rows={3}
                placeholder="Preferred delivery window or rider instructions"
                value={notes}
                onChange={event => setNotes(event.target.value)}
              />
            </label>

            <div className="block font-sans text-[14px]">
              <label htmlFor="checkout-discount-code" className="mb-1.5 block text-text">
                Discount code (optional)
              </label>
              <div className="flex gap-2">
                <Input
                  id="checkout-discount-code"
                  autoComplete="off"
                  placeholder="Enter promo code if you have one"
                  value={discountCode}
                  onChange={event => {
                    setDiscountCode(event.target.value.toUpperCase());
                    setDiscountError(null);
                    if (appliedDiscount) setAppliedDiscount(null);
                  }}
                  className="uppercase"
                />
                {appliedDiscount ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAppliedDiscount(null);
                      setDiscountCode("");
                      setDiscountError(null);
                    }}
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={validatingCode || !discountCode.trim()}
                    onClick={() => void handleApplyDiscount()}
                  >
                    {validatingCode ? "Checking..." : "Apply"}
                  </Button>
                )}
              </div>
              {appliedDiscount ? (
                <p className="mt-1.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
                  Code {appliedDiscount.code} applied ({appliedDiscount.label})
                </p>
              ) : null}
              {discountError ? (
                <p role="alert" className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">
                  {discountError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 border-t border-text/12 pt-5 font-sans text-[14px]">
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
              <div className="space-y-2 bg-stone p-4">
                <label className="block">
                  <span className="mb-1.5 block text-text">
                    Gift note (optional)
                  </span>
                  <Input
                    maxLength={300}
                    placeholder="Write a personal message for the gift card"
                    value={giftNote}
                    onChange={event => setGiftNote(event.target.value)}
                  />
                </label>
                <p className="text-[12px] text-muted">
                  Prices are kept hidden on gift packing slips.
                </p>
              </div>
            ) : null}

            <label className="flex cursor-pointer items-start gap-2.5 text-text">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={event => setMarketingOptIn(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brass"
              />
              <span>Send me new arrivals and offers on WhatsApp</span>
            </label>
          </div>

          {!isStoreOpen ? (
            <div
              role="status"
              className="rounded-[2px] border border-brass/50 bg-stone px-4 py-3 font-sans text-[14px] text-text"
            >
              {storeSettings.holidayBannerMessage.trim() ||
                "Our Nairobi studio is temporarily closed. Browsing stays open, and sending orders will resume when we reopen."}
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 font-sans text-[14px] text-red-600 dark:text-red-400"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-3 pt-2">
            <Button
              type="submit"
              disabled={loading || !isStoreOpen}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Saving your order...
                </>
              ) : !isStoreOpen ? (
                "Store temporarily closed"
              ) : (
                <>
                  <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
                  Send order on WhatsApp
                </>
              )}
            </Button>

            <p className="text-center font-sans text-[12px] leading-[1.5] text-muted">
              By sending your order you agree to our{" "}
              <Link
                href="/terms"
                className="underline underline-offset-4 hover:text-brass"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="underline underline-offset-4 hover:text-brass"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </form>

        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="border-t border-text/12 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <h2 className="font-sans text-[14px] font-medium text-text">
              Order summary ({itemCount} {itemCount === 1 ? "item" : "items"})
            </h2>

            {freeDeliveryThreshold > 0 ? (
              <div className="mt-4 rounded-[2px] border border-text/12 bg-stone px-3.5 py-2.5 font-sans text-[13px] text-text">
                <p className="flex items-center gap-2">
                  <Truck className="h-4 w-4 shrink-0 text-brass" aria-hidden />
                  {totals.freeDeliveryUnlocked ? (
                    <span className="font-medium">
                      You unlocked free delivery!
                    </span>
                  ) : (
                    <span>
                      Add{" "}
                      <strong className="font-medium">
                        {formatKES(totals.amountToFreeDelivery)}
                      </strong>{" "}
                      more for free delivery
                    </span>
                  )}
                </p>
              </div>
            ) : null}

            <ul className="mt-4 divide-y divide-text/10 font-sans text-[14px]">
              {items.map(item => (
                <li
                  key={getCartItemKey(item.product.id, item.variant?.id)}
                  className="flex items-baseline justify-between gap-4 py-2.5"
                >
                  <span className="truncate text-text">
                    {formatProductTitle(item.product.title)}
                    {item.variant ? ` (${item.variant.name})` : ""} × {item.quantity}
                  </span>
                  <PriceKES
                    amount={getCartItemUnitPrice(item) * item.quantity}
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-2 border-t border-text/12 pt-4 font-sans text-[14px]">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span className="text-text">{formatKES(totals.subtotal)}</span>
              </div>

              {totals.discountAmount > 0 ? (
                <div className="flex justify-between text-muted">
                  <span>
                    Discount{appliedDiscount ? ` (${appliedDiscount.code})` : ""}
                  </span>
                  <span className="text-brass">
                    −{formatKES(totals.discountAmount)}
                  </span>
                </div>
              ) : appliedDiscount?.freeDeliveryApplied ? (
                <div className="flex justify-between text-muted">
                  <span>Promo ({appliedDiscount.code})</span>
                  <span className="text-brass">Free delivery</span>
                </div>
              ) : null}

              <div className="flex justify-between text-muted">
                <span>
                  Delivery{selectedZone ? ` (${selectedZone.name})` : ""}
                </span>
                <span className="text-text">
                  {totals.deliveryFee === 0
                    ? "Free"
                    : formatKES(totals.deliveryFee)}
                </span>
              </div>

              <div className="flex justify-between border-t border-text/12 pt-3 text-[16px] font-medium text-text">
                <span>Total</span>
                <PriceKES amount={totals.total} className="text-[16px] font-medium" />
              </div>

              <p className="pt-2 text-[13px] text-muted">
                Payment: cash or M-Pesa on delivery
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
