import type { FaqItem } from "@/lib/seo";
import type { DeliveryZone, StoreSettings } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export const LEGAL_DRAFT_HTML_COMMENT =
  "<!-- DRAFT — owner to review before publishing -->";

export const ABOUT_OWNER_HTML_COMMENT =
  "<!-- TODO(owner): Replace studio photo slot with a real Nairobi studio/team photograph and add the founder brand story before launch -->";

export const RETURNS_POLICY_CONFIG = {
  // TODO(owner): confirm exchange window in days (default 7 days)
  exchangeWindowDays: 7,
  damageReportHours: 48,
  // TODO(owner): confirm whether refunds default to M-Pesa reversal, store credit, or customer choice
  refundMethodsSummary: "M-Pesa reversal or store credit"
} as const;

export const ABOUT_OWNER_SLOTS = {
  // TODO(owner): drop a real Nairobi studio or team photograph in /public and set its path here
  studioPhotoPath: null as string | null,
  // TODO(owner): replace null with authentic brand story paragraphs written by the founder
  brandStoryParagraphs: null as readonly string[] | null
} as const;

/**
 * Formats an HH:MM 24-hour EAT cutoff (e.g. "14:00") into a clear customer label ("2:00 pm EAT").
 */
export function formatCutoffEatLabel(sameDayCutoff: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(sameDayCutoff.trim());
  if (!match) return "2:00 pm EAT";

  const hours24 = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours24) ||
    !Number.isInteger(minutes) ||
    hours24 < 0 ||
    hours24 > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return "2:00 pm EAT";
  }

  const period = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minuteStr = String(minutes).padStart(2, "0");
  return `${hours12}:${minuteStr} ${period} EAT`;
}

export function partitionDeliveryZones(zones: readonly DeliveryZone[]): {
  nairobiZones: DeliveryZone[];
  outsideNairobiZones: DeliveryZone[];
  minNairobiFee: number;
  maxNairobiFee: number;
} {
  const sorted = [...zones]
    .filter(zone => zone.active)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });

  const nairobiZones = sorted.filter(zone => !zone.is_outside_nairobi);
  const outsideNairobiZones = sorted.filter(zone => zone.is_outside_nairobi);
  const nairobiFees = nairobiZones.map(zone => Number(zone.fee)).filter(Number.isFinite);

  return {
    nairobiZones,
    outsideNairobiZones,
    minNairobiFee: nairobiFees.length > 0 ? Math.min(...nairobiFees) : 150,
    maxNairobiFee: nairobiFees.length > 0 ? Math.max(...nairobiFees) : 350
  };
}

export function buildStorefrontFaqs(
  settings: Pick<
    StoreSettings,
    | "same_day_cutoff"
    | "business_hours"
    | "free_delivery_threshold"
    | "pending_auto_cancel_hours"
  >,
  zones: readonly DeliveryZone[]
): FaqItem[] {
  const cutoffLabel = formatCutoffEatLabel(settings.same_day_cutoff);
  const { minNairobiFee, maxNairobiFee, outsideNairobiZones } =
    partitionDeliveryZones(zones);
  const upcountryFee = outsideNairobiZones[0]?.fee ?? 400;

  const freeDeliverySentence =
    settings.free_delivery_threshold > 0
      ? ` Orders with a subtotal of ${formatCurrency(settings.free_delivery_threshold)} or more qualify for free delivery.`
      : "";

  return [
    {
      question: "How do I order on WhatsApp?",
      answer: `You do not need an account. Add your pieces to your bag, open checkout, select your delivery zone, and tap the WhatsApp order button. Your order number is saved immediately and reserves your items while opening a pre-filled WhatsApp message to our Nairobi desk. Please send that message so we can confirm dispatch — unconfirmed pending orders are automatically cancelled after ${settings.pending_auto_cancel_hours} hours so reserved stock returns to the store.`
    },
    {
      question: "How does payment on delivery work?",
      answer:
        "You pay when your order arrives — either in cash or via M-Pesa on delivery. You can inspect your parcel at handover before paying. We do not collect card details or online prepayments on the website."
    },
    {
      question: "What are your delivery times and fees?",
      answer: `Every zone has a fixed fee in KES shown on our Delivery page and at checkout. Nairobi rider delivery fees range from ${formatCurrency(minNairobiFee)} to ${formatCurrency(maxNairobiFee)}, with same-day dispatch for orders confirmed before ${cutoffLabel} (${settings.business_hours}). Deliveries outside Nairobi ship by nationwide courier for ${formatCurrency(upcountryFee)} and arrive within 1–2 business days.${freeDeliverySentence}`
    },
    {
      question: "How do I track my order?",
      answer:
        "You receive a unique order number (for example AA-7F3K2) and a confirmation link as soon as you check out. You can also visit our Track Order page anytime and enter your order number and phone number to check live progress from confirmation through rider dispatch and delivery. Once dispatched, we also message you your rider's name and phone number on WhatsApp."
    },
    {
      question: "What is your return and exchange policy?",
      answer: `Inspect your pieces on arrival. If an item arrives damaged or incorrect, message us on WhatsApp within ${RETURNS_POLICY_CONFIG.damageReportHours} hours with your order number and a clear photo. Unworn watches and jewelry in their original packaging can be exchanged within ${RETURNS_POLICY_CONFIG.exchangeWindowDays} days of delivery. For hygiene reasons, earrings and beauty or lip products can only be returned if unopened or faulty. Approved refunds are issued by ${RETURNS_POLICY_CONFIG.refundMethodsSummary}.`
    },
    {
      question: "Can I place a gift order with hidden prices?",
      answer:
        "Yes. Tick the gift option at checkout to add a personal gift note and hide item prices on the packing slip. You can also mention recipient handover details in the delivery notes."
    },
    {
      question: "How do discount codes work?",
      answer:
        "If you have a promo code, enter it in the discount code box at checkout before sending your WhatsApp order. Our system verifies eligibility immediately — including active dates, minimum order thresholds in KES, and single-use or first-order rules — and applies the discount to your confirmed order total before dispatch."
    }
  ];
}

