import { OrderManager } from "@/components/admin/order-manager";
import { listAdminOrders } from "@/lib/data";

export const metadata = {
  title: "Orders Admin | Auro Ardon",
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage() {
  const orders = await listAdminOrders();

  return <OrderManager initialOrders={orders} />;
}
