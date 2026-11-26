import {
  formatOrderDisplayNumber,
  resolveCanonicalOrderStatus
} from "@/lib/admin-orders";
import { computeInvoiceBalanceDue, toMoneyNumber } from "@/lib/invoices";
import { computeOrderAmountToCollect } from "@/lib/riders";
import { DEFAULT_MESSAGE_TEMPLATES, SITE_NAME, SITE_URL } from "@/lib/site";
import type {
  Invoice,
  Order,
  OrderTemplateWhatsAppUrls,
  StoreMessageTemplates,
  StoreSettings
} from "@/lib/types";
import {
  createWhatsAppLink,
  normalizeKenyanPhoneNumber,
  normalizeWhatsAppNumber
} from "@/lib/utils";

export type MessageTemplateKey = keyof StoreMessageTemplates;

export const TEMPLATE_PLACEHOLDERS = [
  { token: "{name}", description: "Customer full name" },
  { token: "{order}", description: "Order number (e.g. AA-7F3K2)" },
  { token: "{total}", description: "Order total or balance due in KES" },
  { token: "{rider}", description: "Assigned delivery rider name" },
  { token: "{rider_phone}", description: "Assigned delivery rider phone" },
  { token: "{track_link}", description: "Signed order tracking URL" },
  { token: "{invoice_link}", description: "Public invoice / receipt link" },
  { token: "{review_link}", description: "Verified review link for delivered orders" }
] as const;

export const MESSAGE_TEMPLATE_META: ReadonlyArray<{
  key: MessageTemplateKey;
  label: string;
  description: string;
  suggestedTokens: readonly string[];
}> = [
  {
    key: "confirmed",
    label: "Order confirmed",
    description: "Sent after verifying the order on WhatsApp and issuing the invoice.",
    suggestedTokens: ["{name}", "{order}", "{total}", "{track_link}", "{invoice_link}"]
  },
  {
    key: "dispatched",
    label: "Order dispatched",
    description: "Sent when handing the order to a rider — auto-fills rider name and phone.",
    suggestedTokens: [
      "{name}",
      "{order}",
      "{rider}",
      "{rider_phone}",
      "{total}",
      "{track_link}"
    ]
  },
  {
    key: "delivered",
    label: "Delivered & thank-you",
    description: "Sent after delivery with the receipt link and verified review link.",
    suggestedTokens: ["{name}", "{order}", "{invoice_link}", "{review_link}"]
  },
  {
    key: "cancelled",
    label: "Order cancelled",
    description: "Sent if an order is cancelled or times out before confirmation.",
    suggestedTokens: ["{name}", "{order}"]
  },
  {
    key: "unpaid_reminder",
    label: "Unpaid balance reminder",
    description: "Friendly follow-up when a delivered or active order still has a balance due.",
    suggestedTokens: ["{name}", "{order}", "{total}", "{invoice_link}", "{track_link}"]
  },
  {
    key: "back_in_stock",
    label: "Back in stock waitlist",
    description: "Sent to shoppers who joined the WhatsApp waitlist when a piece is restocked.",
    suggestedTokens: ["{name}", "{product}", "{url}"]
  }
];

export interface WhatsAppTemplateVariables {
  name?: string | null;
  order?: string | null;
  total?: number | string | null;
  rider?: string | null;
  rider_phone?: string | null;
  track_link?: string | null;
  invoice_link?: string | null;
  review_link?: string | null;
  product?: string | null;
  url?: string | null;
}

function formatKesNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const numeric = toMoneyNumber(value);
  const isWhole = Math.abs(numeric - Math.round(numeric)) < 0.005;
  return numeric.toLocaleString("en-KE", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2
  });
}

/**
 * Interpolates any store WhatsApp message template using supported placeholders:
 * {name}, {order}, {total}, {rider}, {rider_phone}, {track_link}, {invoice_link}, {review_link}
 * (plus {product} / {url} for back-in-stock alerts).
 */
export function renderWhatsAppTemplate(
  template: string | null | undefined,
  vars: WhatsAppTemplateVariables,
  fallbackKey: MessageTemplateKey = "confirmed"
): string {
  const base = template?.trim() || DEFAULT_MESSAGE_TEMPLATES[fallbackKey];
  const riderName = vars.rider?.trim() || "our delivery rider";
  const riderPhone = vars.rider_phone?.trim() || "";
  const formattedTotal = formatKesNumber(vars.total);

  let rendered = base
    .replace(/\{\{?\s*name\s*\}?\}/gi, vars.name?.trim() || "there")
    .replace(/\{\{?\s*order\s*\}?\}/gi, vars.order?.trim() || "")
    .replace(/\{\{?\s*total\s*\}?\}/gi, formattedTotal)
    .replace(/\{\{?\s*rider\s*\}?\}/gi, riderName)
    .replace(/\{\{?\s*rider_phone\s*\}?\}/gi, riderPhone)
    .replace(/\{\{?\s*track_link\s*\}?\}/gi, vars.track_link?.trim() || `${SITE_URL}/track`)
    .replace(
      /\{\{?\s*invoice_link\s*\}?\}/gi,
      vars.invoice_link?.trim() || vars.track_link?.trim() || `${SITE_URL}/track`
    )
    .replace(
      /\{\{?\s*review_link\s*\}?\}/gi,
      vars.review_link?.trim() || vars.track_link?.trim() || `${SITE_URL}/track`
    )
    .replace(/\{\{?\s*product\s*\}?\}/gi, vars.product?.trim() || "your saved item")
    .replace(/\{\{?\s*url\s*\}?\}/gi, vars.url?.trim() || `${SITE_URL}/shop`);

  if (!riderPhone) {
    rendered = rendered.replace(/\s*\(\s*\)/g, "");
  }

  return rendered.replace(/\s{2,}/g, " ").trim();
}

function resolveCustomerWhatsAppPhone(rawPhone: string): string | null {
  try {
    return normalizeKenyanPhoneNumber(rawPhone);
  } catch {
    return normalizeWhatsAppNumber(rawPhone);
  }
}

/**
 * Builds pre-filled wa.me/{customerPhone} links for every order-lifecycle template.
 */
export function buildOrderTemplateLinks(params: {
  order: Pick<
    Order,
    | "id"
    | "order_number"
    | "customer_name"
    | "customer_phone"
    | "total"
    | "payment_status"
    | "status"
    | "order_status"
    | "rider_name"
    | "rider_phone"
  >;
  invoice?: Pick<
    Invoice,
    "status" | "total" | "amount_paid" | "credited_amount" | "share_token" | "share_revoked"
  > | null;
  templates?: Partial<StoreMessageTemplates> | null;
  trackLink?: string | null;
  invoiceLink?: string | null;
  reviewLink?: string | null;
}): OrderTemplateWhatsAppUrls {
  const phone = resolveCustomerWhatsAppPhone(params.order.customer_phone);
  if (!phone) {
    return {
      confirmed: null,
      dispatched: null,
      delivered: null,
      cancelled: null,
      unpaid_reminder: null
    };
  }

  const orderNumber = formatOrderDisplayNumber(params.order);
  const trackLink = params.trackLink?.trim() || `${SITE_URL}/track`;
  const invoiceLink =
    params.invoiceLink?.trim() ||
    (params.invoice?.share_token && !params.invoice.share_revoked
      ? `${SITE_URL}/i/${params.invoice.share_token}`
      : trackLink);
  const reviewLink = params.reviewLink?.trim() || `${trackLink}#review`;

  const orderTotal = toMoneyNumber(params.order.total);
  const balanceDue = computeOrderAmountToCollect(params.order, params.invoice ?? null);
  const templates = {
    ...DEFAULT_MESSAGE_TEMPLATES,
    ...(params.templates ?? {})
  };

  const commonVars: WhatsAppTemplateVariables = {
    name: params.order.customer_name,
    order: orderNumber,
    rider: params.order.rider_name,
    rider_phone: params.order.rider_phone,
    track_link: trackLink,
    invoice_link: invoiceLink,
    review_link: reviewLink
  };

  return {
    confirmed: createWhatsAppLink(
      phone,
      renderWhatsAppTemplate(
        templates.confirmed,
        { ...commonVars, total: orderTotal },
        "confirmed"
      )
    ),
    dispatched: createWhatsAppLink(
      phone,
      renderWhatsAppTemplate(
        templates.dispatched,
        { ...commonVars, total: balanceDue > 0 ? balanceDue : orderTotal },
        "dispatched"
      )
    ),
    delivered: createWhatsAppLink(
      phone,
      renderWhatsAppTemplate(
        templates.delivered,
        { ...commonVars, total: orderTotal },
        "delivered"
      )
    ),
    cancelled: createWhatsAppLink(
      phone,
      renderWhatsAppTemplate(
        templates.cancelled,
        { ...commonVars, total: orderTotal },
        "cancelled"
      )
    ),
    unpaid_reminder: createWhatsAppLink(
      phone,
      renderWhatsAppTemplate(
        templates.unpaid_reminder,
        { ...commonVars, total: balanceDue > 0 ? balanceDue : orderTotal },
        "unpaid_reminder"
      )
    )
  };
}

/**
 * Returns the primary status-matched WhatsApp template CTA (and optional unpaid reminder CTA)
 * to display on an admin order card.
 */
export function getOrderStatusTemplateButtons(params: {
  order: Pick<Order, "status" | "order_status" | "payment_status" | "total" | "rider_name">;
  invoice?: Pick<Invoice, "status" | "total" | "amount_paid" | "credited_amount"> | null;
  urls: OrderTemplateWhatsAppUrls;
}): {
  primary: { key: keyof OrderTemplateWhatsAppUrls; label: string; url: string } | null;
  unpaidReminderUrl: string | null;
} {
  const status = resolveCanonicalOrderStatus(params.order);
  const balanceDue = params.invoice
    ? params.invoice.status === "void" || params.invoice.status === "paid"
      ? 0
      : computeInvoiceBalanceDue(params.invoice)
    : computeOrderAmountToCollect(params.order, null);

  let primary: {
    key: keyof OrderTemplateWhatsAppUrls;
    label: string;
    url: string;
  } | null = null;

  if (status === "confirmed" && params.urls.confirmed) {
    primary = {
      key: "confirmed",
      label: "Send confirmed WhatsApp",
      url: params.urls.confirmed
    };
  } else if (status === "dispatched" && params.urls.dispatched) {
    primary = {
      key: "dispatched",
      label: params.order.rider_name
        ? `Send dispatched WhatsApp (${params.order.rider_name})`
        : "Send dispatched WhatsApp",
      url: params.urls.dispatched
    };
  } else if (status === "delivered" && params.urls.delivered) {
    primary = {
      key: "delivered",
      label: "Send delivered & review WhatsApp",
      url: params.urls.delivered
    };
  } else if (status === "cancelled" && params.urls.cancelled) {
    primary = {
      key: "cancelled",
      label: "Send cancelled WhatsApp",
      url: params.urls.cancelled
    };
  }

  const showUnpaidReminder =
    balanceDue > 0 &&
    (status === "confirmed" || status === "dispatched" || status === "delivered") &&
    Boolean(params.urls.unpaid_reminder);

  return {
    primary,
    unpaidReminderUrl: showUnpaidReminder ? params.urls.unpaid_reminder : null
  };
}

/**
 * Generates a realistic Nairobi sample preview for Store Settings template editing.
 */
export function renderTemplatePreview(
  key: MessageTemplateKey,
  templateText: string,
  settings?: Pick<StoreSettings, "site_name">
): string {
  const siteName = settings?.site_name || SITE_NAME;
  return renderWhatsAppTemplate(
    templateText,
    {
      name: "Amina Wanjiku",
      order: "AA-7F3K2",
      total: 2700,
      rider: "Brian Otieno",
      rider_phone: "254711223344",
      track_link: `${SITE_URL}/order/AA-7F3K2?t=sample`,
      invoice_link: `${SITE_URL}/i/sample-invoice-link`,
      review_link: `${SITE_URL}/order/AA-7F3K2?t=sample#review`,
      product: `${siteName} Classic Watch`,
      url: `${SITE_URL}/shop`
    },
    key
  );
}

