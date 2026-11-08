"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";

import { formatKES } from "@/components/storefront/price-kes";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
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

  if (!open || !product) {
    return null;
  }

  const selectedProduct = product;

  function handleCheckout() {
    addItem(selectedProduct, 1);
    onClose();
    router.push("/checkout");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1216]/60 p-4">
      <div className="w-full max-w-xl border border-stone bg-paper p-6 sm:p-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="font-display text-[28px] font-normal leading-[1.05] tracking-[-0.01em] text-text">
              {selectedProduct.title}
            </h3>
            <p className="mt-2 text-sm text-muted">
              Add this piece to your cart and continue to checkout for {formatKES(selectedProduct.price)}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-[2px] text-text hover:bg-stone"
            aria-label="Close checkout"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <Button type="button" className="w-full" onClick={handleCheckout}>
          Add to cart and checkout
        </Button>
      </div>
    </div>
  );
}
