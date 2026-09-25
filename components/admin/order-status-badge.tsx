import { Badge } from "@/components/ui/badge";
import {
  getOrderStatusBadgeClassName,
  getOrderStatusLabel,
  getPaymentStatusBadgeClassName,
  getPaymentStatusLabel
} from "@/lib/admin-orders";
import type { OrderStatus, PaymentStatus } from "@/lib/types";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      role="status"
      aria-label={`Order status: ${getOrderStatusLabel(status)}`}
    >
      <Badge className={getOrderStatusBadgeClassName(status)}>
        {getOrderStatusLabel(status)}
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
      <Badge className={getPaymentStatusBadgeClassName(status)}>
        {getPaymentStatusLabel(status)}
      </Badge>
    </span>
  );
}
