import { formatProductTitle } from "@/lib/catalog";
import type {
  CanonicalOrderStatus,
  InvoiceStatus,
  Order,
  OrderCancelReason,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  StockMovementType
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

export const CANONICAL_ORDER_STATUSES: CanonicalOrderStatus[] = [
  "pending",
  "confirmed",
  "dispatched",
  "delivered",
  "cancelled",
  "returned"
];

export const ORDER_CANCEL_REASONS: ReadonlyArray<{
  value: OrderCancelReason;
  label: string;
}> = [
  { value: "customer_no_response", label: "Customer no response" },
  { value: "customer_cancelled", label: "Customer cancelled" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "fake_order", label: "Fake order" },
  { value: "delivery_failed", label: "Delivery failed" },
  { value: "other", label: "Other" }
];

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  initial_stock: "Initial stock",
  order_reserved: "Order reserved",
  cancel_restock: "Cancel restock",
  return_restock: "Return restock",
  manual_adjustment: "Manual adjustment",
  damaged_writeoff: "Damaged write-off"
};

export const PAYMENT_STATUSES = ["PENDING", "PAID"] as const satisfies readonly PaymentStatus[];

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_CONFIRMATION: ["PENDING_CONFIRMATION", "CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CONFIRMED", "OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  DELIVERED: ["DELIVERED"],
  CANCELLED: ["CANCELLED"]
};

const CANONICAL_FORWARD_TRANSITIONS: Record<CanonicalOrderStatus, CanonicalOrderStatus[]> = {
  pending: ["confirmed"],
  confirmed: ["dispatched"],
  dispatched: ["delivered"],
  delivered: [],
  cancelled: [],
  returned: []
};

export function mapLegacyStatusToCanonical(status: OrderStatus): CanonicalOrderStatus {
  switch (status) {
    case "PENDING_CONFIRMATION":
      return "pending";
    case "CONFIRMED":
      return "confirmed";
    case "OUT_FOR_DELIVERY":
      return "dispatched";
    case "DELIVERED":
      return "delivered";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

export function resolveCanonicalOrderStatus(
  order: Pick<Order, "status" | "order_status">
): CanonicalOrderStatus {
  if (
    order.status &&
    (CANONICAL_ORDER_STATUSES as readonly string[]).includes(order.status)
  ) {
    return order.status;
  }
  return mapLegacyStatusToCanonical(order.order_status);
}

export function getCanonicalStatusLabel(status: CanonicalOrderStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "dispatched":
      return "Dispatched";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    case "returned":
      return "Returned";
  }
}

export function getCanonicalStatusBadgeClassName(status: CanonicalOrderStatus): string {
  switch (status) {
    case "pending":
      return "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200";
    case "confirmed":
      return "border-blue-300 bg-blue-100 text-blue-950 dark:border-blue-500/40 dark:bg-blue-950/60 dark:text-blue-200";
    case "dispatched":
      return "border-indigo-300 bg-indigo-100 text-indigo-950 dark:border-indigo-500/40 dark:bg-indigo-950/60 dark:text-indigo-200";
    case "delivered":
      return "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200";
    case "cancelled":
      return "border-red-300 bg-red-100 text-red-950 dark:border-red-500/40 dark:bg-red-950/60 dark:text-red-200";
    case "returned":
      return "border-purple-300 bg-purple-100 text-purple-950 dark:border-purple-500/40 dark:bg-purple-950/60 dark:text-purple-200";
  }
}

export function getCancelReasonLabel(reason: OrderCancelReason | null | undefined): string {
  if (!reason) return "Unspecified";
  return (
    ORDER_CANCEL_REASONS.find(option => option.value === reason)?.label ??
    reason.replace(/_/g, " ")
  );
}

export function getNextValidCanonicalStatuses(
  status: CanonicalOrderStatus
): CanonicalOrderStatus[] {
  return CANONICAL_FORWARD_TRANSITIONS[status] ?? [];
}

export function canCancelOrderStatus(status: CanonicalOrderStatus): boolean {
  return status === "pending" || status === "confirmed" || status === "dispatched";
}

export function canReturnOrderStatus(status: CanonicalOrderStatus): boolean {
  return status === "delivered" || status === "returned";
}

export function isPendingOrderOverdue24h(
  order: Pick<Order, "status" | "order_status" | "created_at">,
  nowMs = Date.now()
): boolean {
  if (resolveCanonicalOrderStatus(order) !== "pending") return false;
  const createdMs = Date.parse(order.created_at);
  if (Number.isNaN(createdMs)) return false;
  return nowMs - createdMs >= 24 * 60 * 60 * 1000;
}

export function formatOrderDisplayNumber(
  order: Pick<Order, "id" | "order_number">
): string {
  if (order.order_number && order.order_number.trim()) {
    return order.order_number.trim();
  }
  return `#${order.id.slice(0, 8).toUpperCase()}`;
}

export function getOrderStatusLabel(status: OrderStatus) {
  return status.toLowerCase().replace(/_/g, " ");
}

export function getPaymentStatusLabel(status: PaymentStatus) {
  return status === "PAID" ? "Paid" : "Pending payment";
}

export function getPaymentMethodLabel(method: PaymentMethod) {
  return method === "CASH_ON_DELIVERY" ? "Cash / M-Pesa on delivery" : "WhatsApp (pay on delivery)";
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
  return getCanonicalStatusBadgeClassName(mapLegacyStatusToCanonical(status));
}

export function getPaymentStatusBadgeClassName(status: PaymentStatus) {
  return status === "PAID"
    ? "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200"
    : "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200";
}

export type OrderPaymentDisplayState =
  | "paid"
  | "partially_paid"
  | "pending"
  | "not_applicable"
  | "refunded"
  | "credited";

export interface OrderPaymentDisplayInput {
  orderStatus?: CanonicalOrderStatus | OrderStatus | null;
  paymentStatus: PaymentStatus;
  amountPaid?: number | string | null;
  creditedAmount?: number | string | null;
  creditNoteCount?: number | null;
  hasCreditNote?: boolean;
  invoiceStatus?: InvoiceStatus | null;
  orderTotal?: number | string | null;
}

export interface OrderPaymentDisplay {
  state: OrderPaymentDisplayState;
  label: string;
  className: string;
}

const PAYMENT_DISPLAY_BADGE_CLASSES: Record<OrderPaymentDisplayState, string> = {
  paid: "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200",
  partially_paid:
    "border-blue-300 bg-blue-100 text-blue-950 dark:border-blue-500/40 dark:bg-blue-950/60 dark:text-blue-200",
  pending:
    "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200",
  not_applicable:
    "border-border bg-stone text-muted",
  refunded:
    "border-purple-300 bg-purple-100 text-purple-950 dark:border-purple-500/40 dark:bg-purple-950/60 dark:text-purple-200",
  credited:
    "border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-500/40 dark:bg-sky-950/60 dark:text-sky-200"
};

function parsePositiveAmount(value: number | string | null | undefined): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeDisplayOrderStatus(
  status: CanonicalOrderStatus | OrderStatus | null | undefined
): CanonicalOrderStatus {
  if (!status) return "pending";
  if ((CANONICAL_ORDER_STATUSES as readonly string[]).includes(status)) {
    return status as CanonicalOrderStatus;
  }
  return mapLegacyStatusToCanonical(status as OrderStatus);
}

/**
 * Resolves the human-readable payment status label and muted/semantic badge styling:
 * - Cancelled orders with no payments -> "Not applicable" (muted)
 * - Returned or credited orders -> "Refunded" (when payments were collected) or "Credited" (based on credit notes)
 * - Active orders -> "Paid", "Partially paid", or "Pending payment" (unpaid active orders only)
 */
export function resolveOrderPaymentDisplay(
  input: OrderPaymentDisplayInput
): OrderPaymentDisplay {
  const canonicalStatus = normalizeDisplayOrderStatus(input.orderStatus);
  const paidAmount = parsePositiveAmount(input.amountPaid);
  const creditedAmount = parsePositiveAmount(input.creditedAmount);
  const creditNoteCount = Math.max(
    0,
    Math.floor(Number(input.creditNoteCount ?? 0) || 0)
  );
  const hasCreditNote =
    Boolean(input.hasCreditNote) || creditedAmount > 0 || creditNoteCount > 0;
  const hasPayment =
    paidAmount > 0 ||
    input.paymentStatus === "PAID" ||
    input.invoiceStatus === "paid" ||
    input.invoiceStatus === "partially_paid";

  if (canonicalStatus === "cancelled") {
    if (!hasPayment) {
      return {
        state: "not_applicable",
        label: "Not applicable",
        className: PAYMENT_DISPLAY_BADGE_CLASSES.not_applicable
      };
    }
    if (hasCreditNote) {
      return {
        state: "refunded",
        label: "Refunded",
        className: PAYMENT_DISPLAY_BADGE_CLASSES.refunded
      };
    }
    return {
      state: "paid",
      label: "Paid",
      className: PAYMENT_DISPLAY_BADGE_CLASSES.paid
    };
  }

  if (canonicalStatus === "returned") {
    if (hasPayment) {
      return {
        state: "refunded",
        label: "Refunded",
        className: PAYMENT_DISPLAY_BADGE_CLASSES.refunded
      };
    }
    if (hasCreditNote) {
      return {
        state: "credited",
        label: "Credited",
        className: PAYMENT_DISPLAY_BADGE_CLASSES.credited
      };
    }
    return {
      state: "refunded",
      label: "Refunded",
      className: PAYMENT_DISPLAY_BADGE_CLASSES.refunded
    };
  }

  if (hasCreditNote) {
    const orderTotal = parsePositiveAmount(input.orderTotal);
    const fullyCredited =
      input.invoiceStatus === "void" ||
      (orderTotal > 0 && creditedAmount >= orderTotal);
    if (hasPayment && (fullyCredited || (paidAmount > 0 && creditedAmount >= paidAmount))) {
      return {
        state: "refunded",
        label: "Refunded",
        className: PAYMENT_DISPLAY_BADGE_CLASSES.refunded
      };
    }
    return {
      state: "credited",
      label: "Credited",
      className: PAYMENT_DISPLAY_BADGE_CLASSES.credited
    };
  }

  if (input.paymentStatus === "PAID" || input.invoiceStatus === "paid") {
    return {
      state: "paid",
      label: "Paid",
      className: PAYMENT_DISPLAY_BADGE_CLASSES.paid
    };
  }

  if (input.invoiceStatus === "partially_paid" || paidAmount > 0) {
    return {
      state: "partially_paid",
      label: "Partially paid",
      className: PAYMENT_DISPLAY_BADGE_CLASSES.partially_paid
    };
  }

  return {
    state: "pending",
    label: "Pending payment",
    className: PAYMENT_DISPLAY_BADGE_CLASSES.pending
  };
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

/** Builds the safely quoted OR clause used for the admin order search (order no., name, phone, UUID). */
export function buildAdminOrderSearchFilter(search: string) {
  const likeValue = quotePostgrestLikeValue(search);
  const filters = [
    `order_number.ilike.${likeValue}`,
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

  const status = resolveCanonicalOrderStatus(order);
  const message = generateWhatsAppMessage({
    orderId: formatOrderDisplayNumber(order),
    customerName: order.customer_name,
    total: order.total,
    items: items.map(item => ({
      title: formatProductTitle(item.product_title),
      quantity: item.quantity
    })),
    confirmationMessage: `This is Auro Ardon regarding your order ${formatOrderDisplayNumber(order)}. Current status: ${getCanonicalStatusLabel(status)}.`,
    deliveryLocation: order.customer_location
  });

  return createWhatsAppLink(phone, message);
}
