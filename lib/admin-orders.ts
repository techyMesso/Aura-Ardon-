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
  normalizeKenyanPhoneNumber
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
      return "border-yellow-200 bg-yellow-100 text-yellow-900";
    case "CONFIRMED":
      return "border-blue-200 bg-blue-100 text-blue-900";
    case "OUT_FOR_DELIVERY":
      return "border-indigo-200 bg-indigo-100 text-indigo-900";
    case "DELIVERED":
      return "border-green-200 bg-green-100 text-green-900";
    case "CANCELLED":
      return "border-red-200 bg-red-100 text-red-900";
    default:
      return "";
  }
}

export function getPaymentStatusBadgeClassName(status: PaymentStatus) {
  return status === "PAID"
    ? "border-green-200 bg-green-100 text-green-900"
    : "border-yellow-200 bg-yellow-100 text-yellow-900";
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

export function buildAdminOrderWhatsAppUrl(order: Order, items: OrderItem[]) {
  const message = generateWhatsAppMessage({
    orderId: order.id.slice(0, 8).toUpperCase(),
    customerName: order.customer_name,
    total: order.total,
    items: items.map(item => ({
      title: item.product_title,
      quantity: item.quantity
    })),
    confirmationMessage: `This is Auro Ardon confirming your order. Current status: ${getOrderStatusLabel(order.order_status)}.`,
    deliveryLocation: order.customer_location
  });

  return createWhatsAppLink(
    normalizeKenyanPhoneNumber(order.customer_phone),
    message
  );
}
