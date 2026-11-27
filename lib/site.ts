export const SITE_NAME = "Auro Ardon";
export const DEFAULT_SITE_URL = "https://aura-ardon.vercel.app";
export const CURRENCY = "KES";
export const TIMEZONE = "Africa/Nairobi";
export const DEFAULT_WHATSAPP_NUMBER = "254718038825";

export interface StoreMessageTemplates {
  confirmed: string;
  dispatched: string;
  delivered: string;
  cancelled: string;
  unpaid_reminder: string;
  back_in_stock: string;
}

export interface DefaultStoreSettings {
  site_name: string;
  business_phone: string;
  business_email: string | null;
  business_address: string;
  kra_pin: string | null;
  logo_url: string | null;
  whatsapp_number: string;
  currency: string;
  timezone: string;
  business_hours: string;
  same_day_cutoff: string;
  pending_auto_cancel_hours: number;
  low_stock_default: number;
  free_delivery_threshold: number;
  instagram_url: string;
  tiktok_url: string;
  is_store_open: boolean;
  holiday_banner_message: string;
  invoice_footer: string;
  payment_instructions: string;
  message_templates: StoreMessageTemplates;
  sms_notifications_enabled: boolean;
  legal_reviewed_at: string | null;
}

export interface DefaultDeliveryZone {
  name: string;
  fee: number;
  active: boolean;
  sort_order: number;
  is_outside_nairobi: boolean;
}

export const DEFAULT_MESSAGE_TEMPLATES: StoreMessageTemplates = {
  confirmed:
    "Hi {name}, your Auro Ardon order {order} (KES {total}) is confirmed! Track your order here: {track_link}",
  dispatched:
    "Hi {name}, your Auro Ardon order {order} is on the way with {rider} ({rider_phone}). Total payable on delivery: KES {total}. Track: {track_link}",
  delivered:
    "Thank you for shopping with Auro Ardon, {name}! Your order {order} has been delivered. Invoice: {invoice_link} — We'd love your honest review: {review_link}",
  cancelled:
    "Hi {name}, your Auro Ardon order {order} has been cancelled. Reply here anytime if you'd like to reorder.",
  unpaid_reminder:
    "Hi {name}, friendly reminder that invoice {invoice_link} for order {order} (KES {total}) is still pending payment. Let us know if you need any help.",
  back_in_stock:
    "Hi {name}, good news! An item you asked about at Auro Ardon is back in stock. Reply here or visit our shop to order."
};

export const DEFAULT_STORE_CONFIG: DefaultStoreSettings = {
  site_name: SITE_NAME,
  business_phone: DEFAULT_WHATSAPP_NUMBER,
  business_email: null, // TODO(owner): set official storefront support email in Store Settings
  business_address: "Nairobi, Kenya",
  kra_pin: null, // TODO(owner): optional KRA PIN in Store Settings
  logo_url: null,
  whatsapp_number: DEFAULT_WHATSAPP_NUMBER,
  currency: CURRENCY,
  timezone: TIMEZONE,
  business_hours: "Mon–Sat, 9am–7pm EAT",
  same_day_cutoff: "14:00",
  pending_auto_cancel_hours: 48,
  low_stock_default: 3,
  free_delivery_threshold: 3000,
  instagram_url: "", // Empty = hidden in footer
  tiktok_url: "", // Empty = hidden in footer
  is_store_open: true,
  holiday_banner_message: "",
  invoice_footer:
    "Thank you for shopping with Auro Ardon. Payment is cash or M-Pesa on delivery.",
  payment_instructions: "Pay cash or M-Pesa on delivery.",
  message_templates: DEFAULT_MESSAGE_TEMPLATES,
  sms_notifications_enabled: false,
  legal_reviewed_at: null
};

// TODO(owner): replace with real delivery fees per zone in Store Settings / Delivery Zones
export const DEFAULT_DELIVERY_ZONES: readonly DefaultDeliveryZone[] = [
  { name: "Westlands", fee: 200, active: true, sort_order: 1, is_outside_nairobi: false },
  { name: "Kilimani", fee: 200, active: true, sort_order: 2, is_outside_nairobi: false },
  { name: "Lavington", fee: 200, active: true, sort_order: 3, is_outside_nairobi: false },
  { name: "Kileleshwa", fee: 200, active: true, sort_order: 4, is_outside_nairobi: false },
  { name: "Parklands", fee: 200, active: true, sort_order: 5, is_outside_nairobi: false },
  { name: "CBD", fee: 150, active: true, sort_order: 6, is_outside_nairobi: false },
  { name: "Upper Hill", fee: 200, active: true, sort_order: 7, is_outside_nairobi: false },
  { name: "South B", fee: 250, active: true, sort_order: 8, is_outside_nairobi: false },
  { name: "South C", fee: 250, active: true, sort_order: 9, is_outside_nairobi: false },
  { name: "Lang'ata", fee: 300, active: true, sort_order: 10, is_outside_nairobi: false },
  { name: "Karen", fee: 350, active: true, sort_order: 11, is_outside_nairobi: false },
  { name: "Runda", fee: 350, active: true, sort_order: 12, is_outside_nairobi: false },
  { name: "Kasarani", fee: 300, active: true, sort_order: 13, is_outside_nairobi: false },
  { name: "Thika Road", fee: 300, active: true, sort_order: 14, is_outside_nairobi: false },
  { name: "Embakasi", fee: 300, active: true, sort_order: 15, is_outside_nairobi: false },
  {
    name: "Outside Nairobi (courier)",
    fee: 400,
    active: true,
    sort_order: 16,
    is_outside_nairobi: true
  }
] as const;

/**
 * Resolves the canonical public site URL exclusively from NEXT_PUBLIC_SITE_URL,
 * falling back to DEFAULT_SITE_URL. Never reads VERCEL_URL.
 */
export function resolveSiteUrl(rawValue = process.env.NEXT_PUBLIC_SITE_URL): string {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return DEFAULT_SITE_URL;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return DEFAULT_SITE_URL;
    }
    return trimmed.replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_URL = resolveSiteUrl();

export function buildCanonicalUrl(pathname: string, baseUrl = resolveSiteUrl()): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${baseUrl}${normalizedPath}`;
}

