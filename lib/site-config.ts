import type { Product } from "@/lib/types";

export const SITE_CONFIG = {
  brandName: "Auro Ardon",
  heroHeadline:
    "Jewelry, watches and beauty picks, delivered in Nairobi today.",
  heroSublinePrefix: "Everyday pieces and giftable picks",
  defaultPriceFloorKES: 50,
  brandLine:
    "Auro Ardon is a Nairobi boutique. We pick bold, giftable jewelry, watches, and beauty essentials, deliver across Nairobi in a day, and you pay when it arrives.",
  statementFacts: [
    "Same-day Nairobi delivery",
    "Pay on delivery (cash or M-Pesa)",
    "Order or ask on WhatsApp"
  ] as const,
  deliveryCutoffTime: "2pm",
  deliveryWindowUpcountry: "1–2 days elsewhere in Kenya",
  studioLocation: "Nairobi, Kenya",
  studioHours: "Mon–Sat, 9am–7pm EAT",
  deliveryAreas: [
    "Westlands",
    "Kilimani",
    "Karen",
    "Lavington",
    "CBD",
    "Kileleshwa",
    "Parklands",
    "South B / C",
    "Runda",
    "Kasarani",
    "Embakasi",
    "Outside Nairobi"
  ] as const
};

export function getCatalogPriceFloor(
  products: Pick<Product, "price">[]
): number {
  const prices = products
    .map(product => Number(product.price))
    .filter(price => Number.isFinite(price) && price > 0);

  if (prices.length === 0) {
    return SITE_CONFIG.defaultPriceFloorKES;
  }

  return Math.min(...prices);
}

export function formatHeroSubline(
  products: Pick<Product, "price">[]
): string {
  const floor = Math.round(getCatalogPriceFloor(products)).toLocaleString(
    "en-KE"
  );
  return `${SITE_CONFIG.heroSublinePrefix} from KES ${floor}. Pay on delivery or order on WhatsApp.`;
}

export function getProductDeliveryLine(): string {
  return `Order by ${SITE_CONFIG.deliveryCutoffTime} for same-day delivery in Nairobi. ${SITE_CONFIG.deliveryWindowUpcountry}.`;
}
