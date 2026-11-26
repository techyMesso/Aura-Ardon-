"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Lock, MessageCircle } from "lucide-react";

import { DeliveryEstimate } from "@/components/storefront/delivery-estimate";
import { formatKES, PriceKES } from "@/components/storefront/price-kes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatProductTitle } from "@/lib/catalog";

export interface ConfirmedOrderSummary {
  orderNumber: string;
  status: string;
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
  isGift: boolean;
  giftNote: string | null;
  items: Array<{
    id: string;
    title: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  whatsappUrl: string | null;
}

interface OrderConfirmationClientProps {
  orderNumber: string;
  initialOrder: ConfirmedOrderSummary | null;
  autoLaunch: boolean;
  sameDayCutoff: string;
  businessHours: string;
  isStoreOpen: boolean;
  holidayBannerMessage: string;
}

export function OrderConfirmationClient({
  orderNumber,
  initialOrder,
  autoLaunch,
  sameDayCutoff,
  businessHours,
  isStoreOpen,
  holidayBannerMessage
}: OrderConfirmationClientProps) {
  const [order, setOrder] = useState<ConfirmedOrderSummary | null>(initialOrder);
  const [phone, setPhone] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const launchedRef = useRef(false);

  // Immediately navigate to wa.me via window.location.href (avoids mobile popup blocks)
  useEffect(() => {
    if (!autoLaunch || launchedRef.current || !order?.whatsappUrl) return;
    launchedRef.current = true;

    try {
      const current = new URL(window.location.href);
      current.searchParams.delete("launch");
      window.history.replaceState(null, "", current.toString());
    } catch {
      // Ignore history errors
    }

    window.location.href = order.whatsappUrl;
  }, [autoLaunch, order?.whatsappUrl]);

  async function handleVerifyPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verifying) return;
    setVerifying(true);
    setError(null);

    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber,
          phone: phone.trim()
        })
      });

      const payload = (await response.json()) as ConfirmedOrderSummary & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "No order found matching that order number and phone number."
        );
      }

      setOrder(payload);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to verify order."
      );
    } finally {
      setVerifying(false);
    }
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="border border-text/15 bg-paper p-6 sm:p-8">
          <div className="flex items-center gap-2 text-brass">
            <Lock className="h-4 w-4" aria-hidden />
            <span className="font-sans text-[12px] font-semibold uppercase tracking-[0.18em]">
              Verify your order
            </span>
          </div>
          <h1 className="mt-2 font-serif text-[32px] font-normal leading-[1.05] text-text">
            Order {orderNumber}
          </h1>
          <p className="mt-3 font-sans text-[14px] leading-[1.5] text-muted">
            For your privacy, enter the Kenyan phone number used when placing this order to view your confirmation details.
          </p>

          <form onSubmit={handleVerifyPhone} className="mt-6 space-y-4">
            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">Phone number</span>
              <Input
                required
                type="tel"
                inputMode="tel"
                placeholder="0712 345 678 or +254 712 345 678"
                value={phone}
                onChange={event => setPhone(event.target.value)}
              />
            </label>

            {error ? (
              <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={verifying} className="w-full">
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Verifying...
                </>
              ) : (
                "View order details"
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
      <div
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 rounded-[2px] border border-brass/40 bg-stone px-3 py-1.5 font-sans text-[13px] font-medium text-text"
      >
        <CheckCircle2 className="h-4 w-4 text-brass" aria-hidden />
        <span>Order {order.orderNumber}</span>
      </div>

      <h1 className="mt-4 font-serif text-[34px] font-normal leading-[1.08] tracking-[-0.01em] text-text sm:text-[44px]">
        Your order is ready — send the WhatsApp message to confirm it.
      </h1>

      <div className="mt-6 flex flex-wrap gap-3">
        {order.whatsappUrl ? (
          <a
            href={order.whatsappUrl}
            onClick={event => {
              event.preventDefault();
              window.location.href = order.whatsappUrl!;
            }}
            className="btn-primary inline-flex items-center gap-2"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Open WhatsApp again
          </a>
        ) : null}

        <Link href="/track" className="btn-outline">
          Track order status
        </Link>
      </div>

      <section className="mt-8 border-t border-text/12 pt-6">
        <h2 className="font-sans text-[14px] font-medium uppercase tracking-[0.12em] text-muted">
          Order details
        </h2>

        <ul className="mt-4 divide-y divide-text/10 font-sans text-[14px]">
          {order.items.map(item => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-4 py-2.5"
            >
              <span className="text-text">
                {formatProductTitle(item.title)} × {item.quantity}
              </span>
              <span className="shrink-0 text-text">
                {formatKES(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-2 border-t border-text/12 pt-4 font-sans text-[14px]">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="text-text">{formatKES(order.subtotal)}</span>
          </div>
          {order.discountAmount > 0 ? (
            <div className="flex justify-between text-muted">
              <span>
                Discount{order.discountCode ? ` (${order.discountCode})` : ""}
              </span>
              <span className="text-brass">−{formatKES(order.discountAmount)}</span>
            </div>
          ) : order.discountCode && order.deliveryFee === 0 ? (
            <div className="flex justify-between text-muted">
              <span>Promo ({order.discountCode})</span>
              <span className="text-brass">Free delivery</span>
            </div>
          ) : null}
          <div className="flex justify-between text-muted">
            <span>
              Delivery{order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ""}
            </span>
            <span className="text-text">
              {order.deliveryFee === 0 ? "Free" : formatKES(order.deliveryFee)}
            </span>
          </div>
          <div className="flex justify-between border-t border-text/12 pt-3 text-[16px] font-medium text-text">
            <span>Total</span>
            <PriceKES amount={order.total} className="text-[16px] font-medium" />
          </div>
        </div>

        <dl className="mt-6 grid gap-3 border-t border-text/12 pt-5 font-sans text-[14px] sm:grid-cols-2">
          <div>
            <dt className="text-muted">Recipient</dt>
            <dd className="mt-0.5 text-text">{order.customerName}</dd>
          </div>
          <div>
            <dt className="text-muted">Payment method</dt>
            <dd className="mt-0.5 text-text">Cash or M-Pesa on delivery</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Delivery address</dt>
            <dd className="mt-0.5 text-text">
              {order.deliveryZoneName
                ? `${order.deliveryZoneName} — ${order.deliveryAddress}`
                : order.deliveryAddress}
              {order.townCounty ? ` (${order.townCounty})` : ""}
            </dd>
          </div>
          {order.isGift ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Gift</dt>
              <dd className="mt-0.5 text-text">
                {order.giftNote
                  ? `Yes — "${order.giftNote}"`
                  : "Yes (prices hidden on slip)"}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="mt-8 space-y-4 border-t border-text/12 pt-6">
        <h2 className="font-sans text-[14px] font-medium uppercase tracking-[0.12em] text-muted">
          What happens next
        </h2>
        <ol className="list-decimal space-y-2 pl-5 font-sans text-[14px] leading-[1.6] text-text">
          <li>Send the pre-filled WhatsApp message to our Nairobi studio desk.</li>
          <li>We confirm your reserved pieces and assign a rider or courier.</li>
          <li>Inspect your order on arrival and pay cash or M-Pesa on delivery.</li>
        </ol>

        <DeliveryEstimate
          sameDayCutoff={sameDayCutoff}
          businessHours={businessHours}
          isStoreOpen={isStoreOpen}
          holidayBannerMessage={holidayBannerMessage}
        />
      </section>
    </div>
  );
}

