import { Badge } from "@/components/ui/badge";
import { getOrderStatusBadgeClassName, getOrderStatusLabel } from "@/lib/admin-orders";
import type { OrderStatus } from "@/lib/types";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge className={getOrderStatusBadgeClassName(status)}>
      {getOrderStatusLabel(status)}
    </Badge>
  );
}
