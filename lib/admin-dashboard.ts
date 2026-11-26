import { resolveCanonicalOrderStatus } from "@/lib/admin-orders";
import type { Order, OrderReturnRecord, Product } from "@/lib/types";

export interface AdminDashboardOverview {
  revenue: number;
  grossRevenue: number;
  returnsTotal: number;
  totalOrders: number;
  pendingConfirmationOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  activeProducts: number;
  recentOrders: Order[];
  lowStockProducts: Product[];
}

function toTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function toAmount(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function buildAdminDashboardOverview(
  products: Product[],
  orders: Order[],
  returns: Array<Pick<OrderReturnRecord, "order_id" | "refund_amount">> = []
): AdminDashboardOverview {
  // Revenue rule: cancelled orders NEVER count; returns are subtracted when returned.
  const activeOrders = orders.filter(
    order => resolveCanonicalOrderStatus(order) !== "cancelled"
  );
  const activeOrderIds = new Set(activeOrders.map(order => order.id));

  const grossRevenue = activeOrders.reduce(
    (total, order) => total + toAmount(order.total),
    0
  );
  const returnsTotal = returns
    .filter(ret => activeOrderIds.has(ret.order_id))
    .reduce((total, ret) => total + toAmount(ret.refund_amount), 0);
  const netRevenue = Math.max(0, grossRevenue - returnsTotal);

  const recentOrders = [...orders]
    .sort((left, right) => toTimestamp(right.created_at) - toTimestamp(left.created_at))
    .slice(0, 6);
  const lowStockProducts = products
    .filter(product => product.stock_quantity <= 5)
    .sort(
      (left, right) =>
        left.stock_quantity - right.stock_quantity || left.title.localeCompare(right.title)
    );

  return {
    revenue: netRevenue,
    grossRevenue,
    returnsTotal,
    totalOrders: activeOrders.length,
    pendingConfirmationOrders: orders.filter(
      order => resolveCanonicalOrderStatus(order) === "pending"
    ).length,
    deliveredOrders: orders.filter(
      order => resolveCanonicalOrderStatus(order) === "delivered"
    ).length,
    returnedOrders: orders.filter(
      order => resolveCanonicalOrderStatus(order) === "returned"
    ).length,
    activeProducts: products.filter(product => product.active).length,
    recentOrders,
    lowStockProducts
  };
}
