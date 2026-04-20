"use client";

import { useState } from "react";
import Image from "next/future/image";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, MapPin, Mail, Phone, User, StickyNote } from "lucide-react";

import { useCart, useCartValue } from "@/lib/cart";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type PaymentMethod = "mpesa" | "cash_on_delivery";

interface FormData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerLocation: string;
  notes: string;
  paymentMethod: PaymentMethod;
}

export function CheckoutPageClient() {
  const { items, clearCart } = useCart();
  const { total, itemCount } = useCartValue();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerLocation: "",
    notes: "",
    paymentMethod: "mpesa"
  });

  if (items.length === 0 && !success) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <h1 className="font-serif text-4xl text-ink mb-3">Your cart is empty</h1>
        <p className="text-muted mb-8">Add some items to your cart before checking out.</p>
        <Link href="/shop" className="btn-primary">
          Continue Shopping
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6 py-12">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 mb-6">
          <Check className="h-10 w-10 text-green-600" />
        </div>
        <h1 className="font-serif text-4xl text-ink mb-3">Order Placed!</h1>
        <p className="text-muted mb-2">Thank you for your order.</p>
        {orderId && (
          <p className="text-sm text-muted mb-8">Order ID: {orderId.slice(0, 8)}...</p>
        )}
        {formData.paymentMethod === "mpesa" && (
          <p className="text-sm text-muted mb-6 max-w-md">
            We&apos;ve sent an M-Pesa STK prompt to {formData.customerPhone}.
            Please complete the payment to confirm your order.
          </p>
        )}
        {formData.paymentMethod === "cash_on_delivery" && (
          <p className="text-sm text-muted mb-6 max-w-md">
            Your order will be delivered to: {formData.customerLocation}.
            Payment will be collected upon delivery.
          </p>
        )}
        <Link href="/shop" className="btn-primary">
          Continue Shopping
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
            unitPrice: item.product.price
          })),
          customerName: formData.customerName,
          customerEmail: formData.customerEmail || null,
          customerPhone: formData.customerPhone.replace(/\D/g, ""),
          customerLocation: formData.customerLocation,
          notes: formData.notes || null,
          paymentMethod: formData.paymentMethod,
          subtotal: total,
          shippingFee: 0,
          totalAmount: total
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to place order");
      }

      clearCart();
      setOrderId(data.orderId);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
      <Link href="/cart" className="inline-flex items-center text-sm text-muted hover:text-bronze mb-8">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Cart
      </Link>

      <h1 className="heading-display">Checkout</h1>
      <p className="text-muted mt-2 mb-10">{itemCount} {itemCount === 1 ? "item" : "items"} to order</p>

      <div className="grid gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="rounded-[2rem] border border-white/60 bg-white/70 p-8 shadow-luxe backdrop-blur">
              <h2 className="font-serif text-2xl text-ink mb-6">Contact Information</h2>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    <User className="inline h-4 w-4 mr-1" />
                    Full Name *
                  </label>
                  <Input
                    placeholder="Your full name"
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    required
                    className="input-luxe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    <Mail className="inline h-4 w-4 mr-1" />
                    Email (optional)
                  </label>
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={formData.customerEmail}
                    onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                    className="input-luxe"
                  />
                  <p className="text-xs text-muted mt-1">For order updates and receipt</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    <Phone className="inline h-4 w-4 mr-1" />
                    Phone Number *
                  </label>
                  <Input
                    placeholder="0712 345 678"
                    value={formData.customerPhone}
                    onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                    required
                    className="input-luxe"
                  />
                  <p className="text-xs text-muted mt-1">M-Pesa payments will be sent to this number</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    <MapPin className="inline h-4 w-4 mr-1" />
                    Delivery Location *
                  </label>
                  <Input
                    placeholder="e.g., Kilimani, Nairobi or Mombasa Road"
                    value={formData.customerLocation}
                    onChange={(e) => setFormData({ ...formData, customerLocation: e.target.value })}
                    required
                    className="input-luxe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    <StickyNote className="inline h-4 w-4 mr-1" />
                    Order Notes (optional)
                  </label>
                  <Textarea
                    placeholder="Any special instructions for your order..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="input-luxe resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/60 bg-white/70 p-8 shadow-luxe backdrop-blur">
              <h2 className="font-serif text-2xl text-ink mb-6">Payment Method</h2>

              <div className="space-y-4">
                <label className={`flex items-center justify-between p-5 rounded-2xl border cursor-pointer transition ${
                  formData.paymentMethod === "mpesa"
                    ? "border-champagne bg-champagne/10"
                    : "border-border/40 hover:border-bronze"
                }`}>
                  <div className="flex items-center gap-4">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="mpesa"
                      checked={formData.paymentMethod === "mpesa"}
                      onChange={() => setFormData({ ...formData, paymentMethod: "mpesa" })}
                      className="h-5 w-5 text-bronze"
                    />
                    <div>
                      <p className="font-semibold text-ink">M-Pesa</p>
                      <p className="text-sm text-muted">Pay instantly via STK push</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-green-600">KES</span>
                </label>

                <label className={`flex items-center justify-between p-5 rounded-2xl border cursor-pointer transition ${
                  formData.paymentMethod === "cash_on_delivery"
                    ? "border-champagne bg-champagne/10"
                    : "border-border/40 hover:border-bronze"
                }`}>
                  <div className="flex items-center gap-4">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash_on_delivery"
                      checked={formData.paymentMethod === "cash_on_delivery"}
                      onChange={() => setFormData({ ...formData, paymentMethod: "cash_on_delivery" })}
                      className="h-5 w-5 text-bronze"
                    />
                    <div>
                      <p className="font-semibold text-ink">Cash on Delivery</p>
                      <p className="text-sm text-muted">Pay when you receive your order</p>
                    </div>
                  </div>
                </label>
              </div>

              {formData.paymentMethod === "mpesa" && (
                <p className="text-sm text-muted mt-4">
                  You&apos;ll receive an M-Pesa STK push prompt on your phone to complete payment.
                </p>
              )}
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full py-4 text-base" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                `Place Order - ${formatCurrency(total)}`
              )}
            </Button>
          </form>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-[2rem] border border-white/60 bg-white/70 p-8 shadow-luxe backdrop-blur">
            <h2 className="font-serif text-2xl text-ink mb-6">Order Summary</h2>

            <div className="space-y-4 max-h-64 overflow-y-auto">
              {items.map((item) => {
                const categorySlug = item.product.category?.toLowerCase().replace(/\s+/g, "-") || "jewelry";
                return (
                  <div key={item.product.id} className="flex gap-4">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0">
                      <Image
                        src={item.product.images[0] || "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=100&q=80"}
                        alt={item.product.title || "Product"}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                      <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-bronze text-white text-xs flex items-center justify-center">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                         {item.product.title}
                      </p>
                      <p className="text-xs text-muted">{item.quantity} x {formatCurrency(item.product.price)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border mt-6 pt-6 space-y-3 text-sm">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Delivery</span>
                <span>Free</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between text-lg font-semibold text-ink">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
