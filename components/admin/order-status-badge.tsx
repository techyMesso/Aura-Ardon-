import { Badge } from "@/components/ui/badge";
import {
  CANONICAL_ORDER_STATUSES,
  getCanonicalStatusBadgeClassName,
  getCanonicalStatusLabel,
  mapLegacyStatusToCanonical,
  resolveOrderPaymentDisplay
} from "@/lib/admin-orders";
import type {
  CanonicalOrderStatus,
  InvoiceStatus,
  OrderStatus,
  PaymentStatus
} from "@/lib/types";

export function OrderStatusBadge({
  status
}: {
  status: CanonicalOrderStatus | OrderStatus;
}) {
  const canonical: CanonicalOrderStatus = (
    CANONICAL_ORDER_STATUSES as readonly string[]
  ).includes(status)
    ? (status as CanonicalOrderStatus)
    : mapLegacyStatusToCanonical(status as OrderStatus);

  const label = getCanonicalStatusLabel(canonical);

  return (
    <span role="status" aria-label={`Order status: ${label}`}>
      <Badge
        className={`normal-case tracking-normal ${getCanonicalStatusBadgeClassName(canonical)}`}
      >
        {label}
      </Badge>
    </span>
  );
}

export interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  orderStatus?: CanonicalOrderStatus | OrderStatus | null;
  amountPaid?: number | string | null;
  creditedAmount?: number | string | null;
  creditNoteCount?: number | null;
  hasCreditNote?: boolean;
  invoiceStatus?: InvoiceStatus | null;
  orderTotal?: number | string | null;
}

export function PaymentStatusBadge({
  status,
  orderStatus,
  amountPaid,
  creditedAmount,
  creditNoteCount,
  hasCreditNote,
  invoiceStatus,
  orderTotal
}: PaymentStatusBadgeProps) {
  const display = resolveOrderPaymentDisplay({
    orderStatus,
    paymentStatus: status,
    amountPaid,
    creditedAmount,
    creditNoteCount,
    hasCreditNote,
    invoiceStatus,
    orderTotal
  });

  return (
    <span role="status" aria-label={`Payment status: ${display.label}`}>
      <Badge className={`normal-case tracking-normal ${display.className}`}>
        {display.label}
      </Badge>
    </span>
  );
}
