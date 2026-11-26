import { Badge } from "@/components/ui/badge";
import {
  CANONICAL_ORDER_STATUSES,
  getCanonicalStatusBadgeClassName,
  getCanonicalStatusLabel,
  getPaymentStatusBadgeClassName,
  getPaymentStatusLabel,
  mapLegacyStatusToCanonical
} from "@/lib/admin-orders";
import type { CanonicalOrderStatus, OrderStatus, PaymentStatus } from "@/lib/types";

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

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      role="status"
      aria-label={`Payment status: ${getPaymentStatusLabel(status)}`}
    >
      <Badge className={`normal-case tracking-normal ${getPaymentStatusBadgeClassName(status)}`}>
        {getPaymentStatusLabel(status)}
      </Badge>
    </span>
  );
}
