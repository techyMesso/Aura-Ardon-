import { formatProductTitle } from "@/lib/catalog";
import { SITE_NAME } from "@/lib/site";
import { formatCurrency, normalizeWhatsAppNumber } from "@/lib/utils";

export const MAX_WHATSAPP_URL_LENGTH = 1800;

export interface WhatsAppCheckoutItem {
  title: string;
  quantity: number;
  lineTotal: number;
}

export interface WhatsAppCheckoutMessageInput {
  orderNumber: string;
  items: WhatsAppCheckoutItem[];
  subtotal: number;
  discountCode?: string | null;
  discountAmount?: number;
  deliveryZoneName: string;
  deliveryFee: number;
  total: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  townCounty?: string | null;
  isGift?: boolean;
  giftNote?: string | null;
  notes?: string | null;
}

export interface CheckoutTotalsInput {
  subtotal: number;
  zoneFee: number;
  freeDeliveryThreshold: number;
  discountAmount?: number;
  freeDeliveryFromCode?: boolean;
}

export interface CheckoutTotalsResult {
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  freeDeliveryUnlocked: boolean;
  amountToFreeDelivery: number;
  total: number;
}

export function calculateCheckoutTotals({
  subtotal,
  zoneFee,
  freeDeliveryThreshold,
  discountAmount = 0,
  freeDeliveryFromCode = false
}: CheckoutTotalsInput): CheckoutTotalsResult {
  const safeSubtotal = Math.max(0, Number.isFinite(subtotal) ? subtotal : 0);
  const safeZoneFee = Math.max(0, Number.isFinite(zoneFee) ? zoneFee : 0);
  const safeThreshold = Math.max(
    0,
    Number.isFinite(freeDeliveryThreshold) ? freeDeliveryThreshold : 0
  );
  const clampedDiscount = Math.min(
    safeSubtotal,
    Math.max(0, Number.isFinite(discountAmount) ? discountAmount : 0)
  );

  const thresholdReached =
    safeThreshold > 0 && safeSubtotal >= safeThreshold;
  const freeDeliveryUnlocked = thresholdReached || freeDeliveryFromCode;
  const deliveryFee = freeDeliveryUnlocked ? 0 : safeZoneFee;
  const amountToFreeDelivery =
    safeThreshold > 0 && !freeDeliveryUnlocked
      ? Math.max(0, safeThreshold - safeSubtotal)
      : 0;
  const total = Math.max(0, safeSubtotal - clampedDiscount) + deliveryFee;

  return {
    subtotal: safeSubtotal,
    discountAmount: clampedDiscount,
    deliveryFee,
    freeDeliveryUnlocked,
    amountToFreeDelivery,
    total
  };
}

function formatMessageWithItemLimit(
  input: WhatsAppCheckoutMessageInput,
  visibleCount: number
): string {
  const lines: string[] = [
    `Hi ${SITE_NAME}! I'd like to place an order 🛍️`,
    `Order: ${input.orderNumber}`,
    ""
  ];

  const displayedItems = input.items.slice(0, visibleCount);
  for (const item of displayedItems) {
    lines.push(
      `• ${formatProductTitle(item.title)} × ${item.quantity} — ${formatCurrency(item.lineTotal)}`
    );
  }

  const omitted = input.items.length - displayedItems.length;
  if (omitted > 0) {
    lines.push(`• +${omitted} more ${omitted === 1 ? "item" : "items"} (see order ${input.orderNumber})`);
  }

  lines.push("");
  lines.push(`Subtotal: ${formatCurrency(input.subtotal)}`);

  if ((input.discountAmount ?? 0) > 0) {
    const codeLabel = input.discountCode ? ` (${input.discountCode})` : "";
    lines.push(
      `Discount${codeLabel}: −${formatCurrency(input.discountAmount ?? 0)}`
    );
  } else if (input.discountCode && input.deliveryFee === 0) {
    lines.push(`Promo (${input.discountCode}): Free delivery`);
  }

  const deliveryValue =
    input.deliveryFee === 0 ? "Free" : formatCurrency(input.deliveryFee);
  lines.push(`Delivery (${input.deliveryZoneName}): ${deliveryValue}`);
  lines.push(`Total: ${formatCurrency(input.total)}`);
  lines.push("Payment: Cash / M-Pesa on delivery");
  lines.push("");
  lines.push(`Name: ${input.customerName}`);
  lines.push(`Phone: ${input.customerPhone}`);

  const fullAddress = input.townCounty?.trim()
    ? `${input.deliveryZoneName} — ${input.deliveryAddress} (${input.townCounty.trim()})`
    : `${input.deliveryZoneName} — ${input.deliveryAddress}`;
  lines.push(`Address: ${fullAddress}`);

  if (input.isGift) {
    const trimmedGift = input.giftNote?.trim();
    lines.push(trimmedGift ? `Gift: Yes — "${trimmedGift}"` : "Gift: Yes");
  }

  const trimmedNotes = input.notes?.trim();
  if (trimmedNotes) {
    lines.push(`Notes: ${trimmedNotes}`);
  }

  return lines.join("\n");
}

/**
 * Builds the WhatsApp order message and wa.me URL, keeping the encoded URL
 * strictly under MAX_WHATSAPP_URL_LENGTH (~1,800 chars) by collapsing long
 * item lists into "+N more items (see order AA-...)" when needed.
 */
export function buildWhatsAppCheckoutUrl(
  merchantPhone: string,
  input: WhatsAppCheckoutMessageInput
): { message: string; url: string | null } {
  const normalizedPhone = normalizeWhatsAppNumber(merchantPhone);
  const prefix = normalizedPhone ? `https://wa.me/${normalizedPhone}?text=` : "";

  for (let count = input.items.length; count >= 1; count -= 1) {
    const message = formatMessageWithItemLimit(input, count);
    const encodedUrl = normalizedPhone
      ? `${prefix}${encodeURIComponent(message)}`
      : null;

    if (!encodedUrl || encodedUrl.length <= MAX_WHATSAPP_URL_LENGTH || count === 1) {
      if (encodedUrl && encodedUrl.length > MAX_WHATSAPP_URL_LENGTH) {
        // Trim optional notes/gift text gently if single item + huge notes still exceed cap
        const compactInput: WhatsAppCheckoutMessageInput = {
          ...input,
          notes: input.notes ? `${input.notes.slice(0, 100)}…` : null,
          giftNote: input.giftNote ? `${input.giftNote.slice(0, 80)}…` : null
        };
        const compactMessage = formatMessageWithItemLimit(compactInput, 1);
        return {
          message: compactMessage,
          url: `${prefix}${encodeURIComponent(compactMessage)}`
        };
      }

      return { message, url: encodedUrl };
    }
  }

  const fallbackMessage = formatMessageWithItemLimit(input, 1);
  return {
    message: fallbackMessage,
    url: normalizedPhone ? `${prefix}${encodeURIComponent(fallbackMessage)}` : null
  };
}

