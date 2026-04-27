"use client";

import { ShoppingBag, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
}

export function CheckoutModal({
  open,
  onClose,
  product
}: CheckoutModalProps) {
  const { addItem } = useCart();
  const router = useRouter();

  if (!open) {
    return null;
  }

  if (!product) {
    return null;
  }

  const selectedProduct = product;

  function handleCheckout() {
    addItem(selectedProduct, 1);
    onClose();
    router.push("/checkout");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1b140f]/55 p-4 backdrop-blur">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/20 bg-card p-8 shadow-luxe">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
              Order this item
            </p>
            <h3 className="font-serif text-3xl text-ink">{selectedProduct.title}</h3>
            <p className="mt-2 text-sm text-muted">
              Add this piece to your cart and continue with a confirmed checkout for {formatCurrency(selectedProduct.price)}.
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
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-border bg-white/70 p-4 text-sm text-muted">
            Your order will be created during checkout, where you can choose Cash on Delivery or WhatsApp confirmation.
          </div>
          <Button type="button" className="w-full" onClick={handleCheckout}>
            <ShoppingBag className="mr-2 h-4 w-4" />
            Add to Cart and Checkout
          </Button>
        </div>
      </div>
    </div>
  );
}
