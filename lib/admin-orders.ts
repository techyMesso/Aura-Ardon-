import { formatProductTitle } from "@/lib/catalog";
import type {
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus
} from "@/lib/types";
import {
  createWhatsAppLink,
  generateWhatsAppMessage,
  normalizeKenyanPhoneNumber,
  normalizeWhatsAppNumber
} from "@/lib/utils";

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED"
];

export const PAYMENT_STATUSES = ["PENDING", "PAID"] as const satisfies readonly PaymentStatus[];

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_CONFIRMATION: ["PENDING_CONFIRMATION", "CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CONFIRMED", "OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  DELIVERED: ["DELIVERED"],
  CANCELLED: ["CANCELLED"]
};

export function getOrderStatusLabel(status: OrderStatus) {
  return status.toLowerCase().replace(/_/g, " ");
}

export function getPaymentStatusLabel(status: PaymentStatus) {
  return status === "PAID" ? "Paid" : "Pending payment";
}

export function getPaymentMethodLabel(method: PaymentMethod) {
  return method === "CASH_ON_DELIVERY" ? "COD" : "WhatsApp";
}

export function getAllowedOrderStatuses(status: OrderStatus) {
  return ORDER_STATUS_TRANSITIONS[status];
}

export function isValidOrderStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus
) {
  return ORDER_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
}

export function getOrderStatusBadgeClassName(status: OrderStatus) {
  switch (status) {
    case "PENDING_CONFIRMATION":
      return "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200";
    case "CONFIRMED":
      return "border-blue-300 bg-blue-100 text-blue-950 dark:border-blue-500/40 dark:bg-blue-950/60 dark:text-blue-200";
    case "OUT_FOR_DELIVERY":
      return "border-indigo-300 bg-indigo-100 text-indigo-950 dark:border-indigo-500/40 dark:bg-indigo-950/60 dark:text-indigo-200";
    case "DELIVERED":
      return "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200";
    case "CANCELLED":
      return "border-red-300 bg-red-100 text-red-950 dark:border-red-500/40 dark:bg-red-950/60 dark:text-red-200";
    default:
      return "";
  }
}

export function getPaymentStatusBadgeClassName(status: PaymentStatus) {
  return status === "PAID"
    ? "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200"
    : "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function quotePostgrestLikeValue(value: string) {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/"/g, '\\"');

  return `"%${escaped}%"`;
}

/** Builds the safely quoted OR clause used for the admin order search. */
export function buildAdminOrderSearchFilter(search: string) {
  const likeValue = quotePostgrestLikeValue(search);
  const filters = [
    `customer_name.ilike.${likeValue}`,
    `customer_phone.ilike.${likeValue}`
  ];

  if (isUuid(search)) {
    filters.push(`id.eq.${search}`);
  }

  return filters.join(",");
}

export function isGiftOrderWithHiddenPrices(notes: string | null | undefined): boolean {
  return Boolean(notes && /\[Gift order\s*[—-]\s*hide prices on slip\]/i.test(notes));
}

export function buildAdminOrderWhatsAppUrl(order: Order, items: OrderItem[]) {
  let phone: string | null = null;
  try {
    phone = normalizeKenyanPhoneNumber(order.customer_phone);
  } catch {
    phone = normalizeWhatsAppNumber(order.customer_phone);
  }
  if (!phone) return null;

  const message = generateWhatsAppMessage({
    orderId: order.id.slice(0, 8).toUpperCase(),
    customerName: order.customer_name,
    total: order.total,
    items: items.map(item => ({
      title: formatProductTitle(item.product_title),
      quantity: item.quantity
    })),
    confirmationMessage: `This is Auro Ardon confirming your order. Current status: ${getOrderStatusLabel(order.order_status)}.`,
    deliveryLocation: order.customer_location
  });

  return createWhatsAppLink(phone, message);
}
