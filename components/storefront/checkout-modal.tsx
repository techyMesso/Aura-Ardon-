"use client";

import { LoaderCircle, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { OrderStatus, Product } from "@/lib/types";

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
}

interface CheckoutResponse {
  checkoutRequestId: string;
  customerMessage: string;
}

export function CheckoutModal({
  open,
  onClose,
  product
}: CheckoutModalProps) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!checkoutRequestId || !open) {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch(
        `/api/orders/status/${encodeURIComponent(checkoutRequestId)}`,
        {
          cache: "no-store"
        }
      );

      const payload = (await response.json()) as {
        status?: string;
        error?: string;
      };

      if (!response.ok || !payload.status) {
        return;
      }

      setStatus(payload.status);

      if (payload.status !== "new") {
        window.clearInterval(interval);
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [checkoutRequestId, open]);

  useEffect(() => {
    if (!open) {
      setPhone("");
      setLoading(false);
      setError(null);
      setMessage(null);
      setCheckoutRequestId(null);
      setStatus(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  if (!product) {
    return null;
  }

  async function handleCheckout(event: React.FormEvent<HTMLFormElement>) {
    if (!product) return;
    event.preventDefault();
     setLoading(true);
     setError(null);
     setMessage(null);
     setStatus("new");

    try {
      const response = await fetch("/api/mpesa/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          customerPhone: phone
        })
      });

      const payload = (await response.json()) as
        | CheckoutResponse
        | { error?: string };

      if (!response.ok || !("checkoutRequestId" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "Unable to initiate payment."
        );
      }

      setCheckoutRequestId(payload.checkoutRequestId);
      setMessage(payload.customerMessage);
    } catch (caughtError) {
      setStatus(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to initiate payment."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1b140f]/55 p-4 backdrop-blur">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/20 bg-card p-8 shadow-luxe">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
              Express checkout
            </p>
            <h3 className="font-serif text-3xl text-ink">{product.title}</h3>
            <p className="mt-2 text-sm text-muted">
              Pay instantly with M-Pesa STK Push for {formatCurrency(product.price)}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-ink transition hover:bg-sand/50"
            aria-label="Close checkout"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleCheckout} className="space-y-5">
          <div className="rounded-[1.5rem] border border-border bg-white/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
              <Smartphone className="h-4 w-4 text-bronze" />
              Safaricom number
            </div>
            <Input
              placeholder="0712 345 678"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending STK push..." : "Request M-Pesa prompt"}
          </Button>
        </form>

        {message ? <p className="mt-4 text-sm text-green-700">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

        {status ? (
          <div className="mt-6 rounded-[1.5rem] border border-border bg-white/70 p-4">
            <div className="flex items-center gap-3 text-sm text-ink">
              <LoaderCircle className="h-4 w-4 animate-spin text-bronze" />
              Payment status: <strong className="uppercase">{status}</strong>
            </div>
            <p className="mt-2 text-sm text-muted">
              Keep this window open while Safaricom confirms the transaction.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
