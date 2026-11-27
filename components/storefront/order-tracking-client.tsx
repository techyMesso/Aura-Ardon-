"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, RefreshCw } from "lucide-react";

import { formatKES, PriceKES } from "@/components/storefront/price-kes";
import { formatProductTitle } from "@/lib/catalog";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/types";
import { createWhatsAppLink } from "@/lib/utils";

interface OrderTrackingClientProps {
  token: string;
  shortOrderId: string;
  createdAt: string;
  initialOrderStatus: OrderStatus;
  initialPaymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: string;
  shippingFee: string;
  total: string;
  items: Array<{ id: string; product_title: string; quantity: number; unit_price: string }>;
  whatsappNumber: string | null;
}

const STEPS: Array<{ key: OrderStatus; label: string }> = [
  { key: "PENDING_CONFIRMATION", label: "Order received" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery" },
  { key: "DELIVERED", label: "Delivered" }
];

export function OrderTrackingClient({
  token,
  shortOrderId,
  createdAt,
  initialOrderStatus,
  initialPaymentStatus,
  paymentMethod,
  subtotal,
  shippingFee,
  total,
  items,
  whatsappNumber
}: OrderTrackingClientProps) {
  const [orderStatus, setOrderStatus] = useState<OrderStatus>(initialOrderStatus);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(initialPaymentStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCancelled = orderStatus === "CANCELLED";
  const currentStepIndex = STEPS.findIndex(step => step.key === orderStatus);

  const whatsappUrl = createWhatsAppLink(
    whatsappNumber ?? "",
    `Hello Auro Ardon, I am checking on my order #${shortOrderId}.`
  );

  async function refreshStatus() {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/status/${encodeURIComponent(token)}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as {
        orderStatus?: OrderStatus;
        paymentStatus?: PaymentStatus;
        error?: string;
      };
      if (!response.ok || !data.orderStatus || !data.paymentStatus) {
        throw new Error(data.error || "Unable to refresh status.");
      }
      setOrderStatus(data.orderStatus);
      setPaymentStatus(data.paymentStatus);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to refresh status."
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-block rounded-[2px] bg-stone px-3 py-1 font-sans text-[13px] text-text">
          Order #{shortOrderId}
        </span>
        <button
          type="button"
          onClick={() => void refreshStatus()}
          disabled={refreshing}
          className="inline-flex cursor-pointer items-center gap-1.5 font-sans text-[14px] text-text underline underline-offset-4 hover:text-price disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          {refreshing ? "Checking..." : "Refresh status"}
        </button>
      </div>

      <h1 className="mt-4 font-serif text-[40px] font-normal leading-[1.12] tracking-[-0.01em] text-text md:text-[56px]">
        {isCancelled ? "Order cancelled" : "Track your order"}
      </h1>

      <p className="mt-3 font-sans text-[14px] text-muted">
        Placed on{" "}
        {new Intl.DateTimeFormat("en-KE", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }).format(new Date(createdAt))}
      </p>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {isCancelled ? (
        <div className="mt-8 border border-red-400/50 bg-red-500/10 p-5 font-sans text-[14px] text-text">
          This order has been cancelled. Message us on WhatsApp if you have any questions or would like to place a new order.
        </div>
      ) : (
        <ol
          aria-label="Order progress"
          className="mt-8 grid gap-3 sm:grid-cols-4"
        >
          {STEPS.map((step, index) => {
            const complete = index <= currentStepIndex;
            const current = index === currentStepIndex;
            return (
              <li
                key={step.key}
                className={`border p-3.5 font-sans text-[13px] ${
                  current
                    ? "border-brass bg-stone text-text"
                    : complete
                      ? "border-text/20 bg-paper text-text"
                      : "border-text/12 bg-paper text-muted"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                      complete
                        ? "bg-brass text-ink"
                        : "border border-text/25 text-muted"
                    }`}
                  >
                    {complete ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
                  </span>
                  <span className={current ? "font-medium" : undefined}>
                    {step.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-8 grid gap-4 border-y border-text/12 py-5 font-sans text-[14px] sm:grid-cols-2">
        <div>
          <p className="text-muted">Payment method</p>
          <p className="mt-0.5 text-text">
            {paymentMethod === "CASH_ON_DELIVERY"
              ? "Pay on delivery (cash or M-Pesa)"
              : "WhatsApp order"}
          </p>
        </div>
        <div>
          <p className="text-muted">Payment status</p>
          <p className="mt-0.5 text-text">
            {paymentStatus === "PAID" ? "Paid" : "Pending payment"}
          </p>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-8">
          <h2 className="font-sans text-[14px] font-medium text-text">Items</h2>
          <ul className="mt-3 divide-y divide-text/12 border-y border-text/12 font-sans text-[14px]">
            {items.map(item => (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-4 py-3"
              >
                <span className="text-text">
                  {formatProductTitle(item.product_title)} × {item.quantity}
                </span>
                <span className="shrink-0 text-text">
                  {formatKES(Number(item.unit_price) * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 space-y-2 font-sans text-[14px]">
        <div className="flex justify-between text-muted">
          <span>Subtotal</span>
          <span>{formatKES(subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>Delivery</span>
          <span>
            {Number(shippingFee) > 0 ? formatKES(shippingFee) : "Free"}
          </span>
        </div>
        <div className="flex justify-between border-t border-text/12 pt-3 font-medium text-text">
          <span>Total</span>
          <PriceKES amount={total} />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Message us on WhatsApp
          </a>
        ) : null}
        <Link href="/shop" className="btn-outline">
          Continue shopping
        </Link>
      </div>
    </section>
  );
}

