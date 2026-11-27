"use client";

import { useState } from "react";
import { Check, Loader2, MessageCircle, Search } from "lucide-react";

import { formatKES, PriceKES } from "@/components/storefront/price-kes";
import { VerifiedReviewForm } from "@/components/storefront/verified-review-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatProductTitle } from "@/lib/catalog";
import type { CanonicalOrderStatus } from "@/lib/types";
import { createWhatsAppLink } from "@/lib/utils";

interface TrackedOrderData {
  orderNumber: string;
  status: CanonicalOrderStatus;
  paymentStatus: string;
  createdAt: string;
  customerName: string;
  deliveryZoneName: string | null;
  deliveryAddress: string;
  townCounty: string | null;
  subtotal: number;
  discountCode: string | null;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  items: Array<{
    id: string;
    productId?: string | null;
    title: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  whatsappUrl: string | null;
}

const TIMELINE_STEPS: Array<{
  key: CanonicalOrderStatus;
  label: string;
  detail: string;
}> = [
  {
    key: "pending",
    label: "Order received",
    detail: "Awaiting confirmation on WhatsApp."
  },
  {
    key: "confirmed",
    label: "Confirmed",
    detail: "Packed at our Nairobi studio."
  },
  {
    key: "dispatched",
    label: "Dispatched",
    detail: "On the way with our rider or courier."
  },
  {
    key: "delivered",
    label: "Delivered",
    detail: "Handed over and complete."
  }
];

function getStepIndex(status: CanonicalOrderStatus): number {
  switch (status) {
    case "pending":
      return 0;
    case "confirmed":
      return 1;
    case "dispatched":
      return 2;
    case "delivered":
      return 3;
    default:
      return -1;
  }
}

export function TrackOrderClient({ whatsappNumber }: { whatsappNumber: string }) {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracked, setTracked] = useState<TrackedOrderData | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: orderNumber.trim().toUpperCase(),
          phone: phone.trim()
        })
      });

      const payload = (await response.json()) as TrackedOrderData & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "No order found matching that order number and phone number."
        );
      }

      setTracked(payload);
    } catch (caughtError) {
      setTracked(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to find your order."
      );
    } finally {
      setLoading(false);
    }
  }

  const activeStep = tracked ? getStepIndex(tracked.status) : -1;
  const supportWhatsAppUrl = createWhatsAppLink(
    whatsappNumber,
    tracked
      ? `Hi Auro Ardon! I'd like an update on order ${tracked.orderNumber}.`
      : "Hi Auro Ardon! I need help tracking my order."
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-serif text-[40px] font-normal leading-[1.12] tracking-[-0.01em] text-text md:text-[56px]">
        Track your order
      </h1>
      <p className="mt-3 font-sans text-[15px] leading-[1.5] text-muted">
        Enter your order number (for example, <span className="text-text">AA-7F3K2</span>) and the phone number you ordered with.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-4 border border-text/12 bg-paper p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="block font-sans text-[14px]">
            <label htmlFor="track-order-number" className="mb-1.5 block text-text">
              Order number
            </label>
            <Input
              id="track-order-number"
              required
              placeholder="AA-7F3K2"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "track-order-error" : undefined}
              value={orderNumber}
              onChange={event => setOrderNumber(event.target.value.toUpperCase())}
            />
          </div>

          <div className="block font-sans text-[14px]">
            <label htmlFor="track-order-phone" className="mb-1.5 block text-text">
              Phone number
            </label>
            <Input
              id="track-order-phone"
              required
              type="tel"
              inputMode="tel"
              placeholder="0712 345 678"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "track-order-error" : undefined}
              value={phone}
              onChange={event => setPhone(event.target.value)}
            />
          </div>
        </div>

        {error ? (
          <div
            id="track-order-error"
            role="alert"
            aria-live="assertive"
            className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 font-sans text-[14px] text-red-600 dark:text-red-400"
          >
            {error}
          </div>
        ) : null}

        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Looking up order...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" aria-hidden />
              Check status
            </>
          )}
        </Button>
      </form>

      {tracked ? (
        <section className="mt-8 space-y-6 border border-text/12 bg-paper p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-text/12 pb-4">
            <div>
              <p className="font-sans text-[12px] uppercase tracking-[0.15em] text-muted">
                Order {tracked.orderNumber}
              </p>
              <h2 className="mt-1 font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
                {tracked.status === "cancelled"
                  ? "Order cancelled"
                  : tracked.status === "returned"
                    ? "Order returned"
                    : TIMELINE_STEPS[activeStep]?.label ?? "In progress"}
              </h2>
            </div>
            <p className="font-sans text-[13px] text-muted">
              {new Intl.DateTimeFormat("en-KE", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Africa/Nairobi"
              }).format(new Date(tracked.createdAt))}
            </p>
          </div>

          {tracked.status === "cancelled" || tracked.status === "returned" ? (
            <div className="bg-stone p-4 font-sans text-[14px] text-text">
              {tracked.status === "cancelled"
                ? "This order was cancelled and its reserved items were returned to stock."
                : "This order has been marked as returned."}
            </div>
          ) : (
            <ol className="space-y-4">
              {TIMELINE_STEPS.map((step, index) => {
                const completed = index <= activeStep;
                return (
                  <li key={step.key} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] ${
                        completed
                          ? "border-brass bg-brass text-ink"
                          : "border-text/25 bg-paper text-muted"
                      }`}
                    >
                      {completed ? (
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div>
                      <p
                        className={`font-sans text-[14px] font-medium ${
                          completed ? "text-text" : "text-muted"
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="font-sans text-[13px] text-muted">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="border-t border-text/12 pt-4 font-sans text-[14px]">
            <ul className="divide-y divide-text/10">
              {tracked.items.map(item => (
                <li
                  key={item.id}
                  className="flex items-baseline justify-between gap-4 py-2"
                >
                  <span className="text-text">
                    {formatProductTitle(item.title)} × {item.quantity}
                  </span>
                  <span className="text-text">{formatKES(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1.5 border-t border-text/12 pt-3">
              <div className="flex justify-between text-muted">
                <span>
                  Delivery{tracked.deliveryZoneName ? ` (${tracked.deliveryZoneName})` : ""}
                </span>
                <span className="text-text">
                  {tracked.deliveryFee === 0
                    ? "Free"
                    : formatKES(tracked.deliveryFee)}
                </span>
              </div>
              <div className="flex justify-between font-medium text-text">
                <span>Total</span>
                <PriceKES amount={tracked.total} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            {tracked.status === "pending" && tracked.whatsappUrl ? (
              <a
                href={tracked.whatsappUrl}
                onClick={event => {
                  event.preventDefault();
                  window.location.href = tracked.whatsappUrl!;
                }}
                className="btn-primary inline-flex items-center gap-2"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                Confirm on WhatsApp
              </a>
            ) : null}
            {supportWhatsAppUrl ? (
              <a
                href={supportWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline inline-flex items-center gap-2"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                Message studio on WhatsApp
              </a>
            ) : null}
          </div>
          {tracked.status === "delivered" ? (
            <div id="review" className="border-t border-text/12 pt-6">
              <VerifiedReviewForm
                compact
                initialOrderNumber={tracked.orderNumber}
                initialPhone={phone.trim()}
                initialItems={tracked.items
                  .filter((item): item is typeof item & { productId: string } =>
                    Boolean(item.productId)
                  )
                  .map(item => ({
                    productId: item.productId,
                    title: item.title
                  }))}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

