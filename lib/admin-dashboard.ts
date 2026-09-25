import type { Order, Product } from "@/lib/types";

export interface AdminDashboardOverview {
  revenue: number;
  totalOrders: number;
  pendingConfirmationOrders: number;
  deliveredOrders: number;
  activeProducts: number;
  recentOrders: Order[];
  lowStockProducts: Product[];
}

function toTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function toAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function buildAdminDashboardOverview(
  products: Product[],
  orders: Order[]
): AdminDashboardOverview {
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
    revenue: orders.reduce((total, order) => total + toAmount(order.total), 0),
    totalOrders: orders.length,
    pendingConfirmationOrders: orders.filter(
      order => order.order_status === "PENDING_CONFIRMATION"
    ).length,
    deliveredOrders: orders.filter(order => order.order_status === "DELIVERED").length,
    activeProducts: products.filter(product => product.active).length,
    recentOrders,
    lowStockProducts
  };
}
