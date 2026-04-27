"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, MapPin, MessageCircle, Phone, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart, useCartValue } from "@/lib/cart";
import { formatCurrency } from "@/lib/utils";

type PaymentMethod = "CASH_ON_DELIVERY" | "WHATSAPP";

export function CheckoutPageClient() {
  const { items, clearCart } = useCart();
  const { total, itemCount } = useCartValue();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH_ON_DELIVERY");
  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    customerLocation: ""
  });
  const idempotencyKeyRef = useRef(
    typeof crypto !== "undefined" ? crypto.randomUUID() : `checkout-${Date.now()}`
  );

  if (items.length === 0 && !success) {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-4xl text-ink">Your cart is empty</h1>
        <p className="mt-3 max-w-md text-muted">
          Add a few pieces first, then come back here to confirm delivery and payment.
        </p>
        <Link href="/shop" className="btn-primary mt-8 bg-[#111111] text-white hover:bg-[#1d1d1d]">
          Shop Now
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-2xl flex-col items-center justify-center px-6 py-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <Check className="h-10 w-10 text-green-600" />
        </div>
        <h1 className="mt-6 font-serif text-4xl text-ink">Order confirmed</h1>
        <p className="mt-3 text-muted">
          We’ve saved your order{orderId ? ` (#${orderId.slice(0, 8).toUpperCase()})` : ""}.
        </p>
        <p className="mt-2 max-w-md text-sm leading-7 text-muted">
          {paymentMethod === "WHATSAPP"
            ? "Use the WhatsApp button below to send your saved order and we’ll confirm the next steps with you."
            : "We’ll contact you using the phone number you provided and collect payment on delivery."}
        </p>
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-8 bg-[#111111] text-white hover:bg-[#1d1d1d]"
          >
            <MessageCircle className="h-4 w-4" />
            Send WhatsApp Confirmation
          </a>
        ) : null}
        <Link href="/shop" className="btn-outline mt-4">
          Continue Shopping
        </Link>
      </div>
    );
  }

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
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
          customerName: formData.customerName,
          customerEmail: null,
          customerPhone: formData.customerPhone,
          customerLocation: formData.customerLocation,
          notes: null,
          paymentMethod
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to place order");
      }

      clearCart();
      setOrderId(data.orderId);
      setWhatsappUrl(data.whatsappUrl ?? null);
      setSuccess(true);

      if (data.whatsappUrl && paymentMethod === "WHATSAPP") {
        window.location.href = data.whatsappUrl;
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Failed to place order"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-6 lg:px-10 lg:py-12">
      <Link href="/cart" className="inline-flex items-center text-sm text-muted hover:text-bronze">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to cart
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div>
            <p className="section-label">Checkout</p>
            <h1 className="mt-3 font-serif text-4xl text-ink sm:text-5xl">Simple, fast order confirmation</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-muted">
              Just enter your name, phone, and location. We’ll handle the rest through WhatsApp or cash on delivery.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-white/85 p-4 shadow-card">
              <p className="text-sm font-semibold text-ink">Pay on Delivery Available</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/85 p-4 shadow-card">
              <p className="text-sm font-semibold text-ink">Fast Delivery in Nairobi</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/85 p-4 shadow-card">
              <p className="text-sm font-semibold text-ink">Order via WhatsApp</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="rounded-[1.75rem] border border-border/60 bg-white/88 p-6 shadow-card">
              <h2 className="font-serif text-2xl text-ink">Delivery details</h2>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-ink">
                    <User className="h-4 w-4 text-[#c49d52]" />
                    Name
                  </span>
                  <Input
                    required
                    placeholder="Your full name"
                    value={formData.customerName}
                    onChange={event =>
                      setFormData(current => ({ ...current, customerName: event.target.value }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-ink">
                    <Phone className="h-4 w-4 text-[#c49d52]" />
                    Phone
                  </span>
                  <Input
                    required
                    placeholder="0712 345 678"
                    value={formData.customerPhone}
                    onChange={event =>
                      setFormData(current => ({ ...current, customerPhone: event.target.value }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-ink">
                    <MapPin className="h-4 w-4 text-[#c49d52]" />
                    Location
                  </span>
                  <Input
                    required
                    placeholder="Hostel, estate, campus gate, or pickup point"
                    value={formData.customerLocation}
                    onChange={event =>
                      setFormData(current => ({ ...current, customerLocation: event.target.value }))
                    }
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-border/60 bg-white/88 p-6 shadow-card">
              <h2 className="font-serif text-2xl text-ink">How would you like to order?</h2>
              <div className="mt-5 space-y-3">
                <label
                  className={`block rounded-[1.25rem] border p-4 transition ${
                    paymentMethod === "CASH_ON_DELIVERY"
                      ? "border-[#c49d52] bg-[#fff8ed]"
                      : "border-border/60 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === "CASH_ON_DELIVERY"}
                      onChange={() => setPaymentMethod("CASH_ON_DELIVERY")}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-semibold text-ink">Cash on Delivery</p>
                      <p className="mt-1 text-sm text-muted">We confirm the order and you pay when it arrives.</p>
                    </div>
                  </div>
                </label>

                <label
                  className={`block rounded-[1.25rem] border p-4 transition ${
                    paymentMethod === "WHATSAPP"
                      ? "border-[#c49d52] bg-[#fff8ed]"
                      : "border-border/60 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === "WHATSAPP"}
                      onChange={() => setPaymentMethod("WHATSAPP")}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-semibold text-ink">WhatsApp Order</p>
                      <p className="mt-1 text-sm text-muted">We save the order and open WhatsApp so you can confirm it instantly.</p>
                    </div>
                  </div>
                </label>
              </div>
            </section>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="hidden lg:block">
              <Button
                type="submit"
                disabled={loading}
                className="min-h-[56px] w-full bg-[#111111] text-white hover:bg-[#1c1c1c]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Placing order...
                  </>
                ) : (
                  "Place Order"
                )}
              </Button>
            </div>
          </form>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-[1.75rem] border border-border/60 bg-white/88 p-6 shadow-card">
            <h2 className="font-serif text-2xl text-ink">Order summary</h2>
            <div className="mt-5 space-y-3">
              {items.map(item => (
                <div key={item.product.id} className="flex items-start justify-between gap-4 text-sm">
                  <div>
                    <p className="font-medium text-ink">{item.product.title}</p>
                    <p className="text-muted">{item.quantity} x {formatCurrency(item.product.price)}</p>
                  </div>
                  <p className="font-medium text-ink">
                    {formatCurrency(Number(item.product.price) * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between text-sm text-muted">
                <span>Items</span>
                <span>{itemCount}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-muted">
                <span>Delivery</span>
                <span>Free in Nairobi</span>
              </div>
              <div className="mt-4 flex items-center justify-between text-lg font-semibold text-ink">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Total</p>
            <p className="text-lg font-semibold text-ink">{formatCurrency(total)}</p>
          </div>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading}
            className="min-h-[52px] min-w-[160px] bg-[#111111] text-white hover:bg-[#1c1c1c]"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Placing...
              </>
            ) : (
              "Place Order"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
