import { Suspense } from "react";

import { OrderManager } from "@/components/admin/order-manager";
import { listAdminOrders } from "@/lib/data";

export const metadata = {
  title: "Orders Admin",
  robots: { index: false, follow: false }
};

export default async function AdminOrdersPage() {
  const orders = await listAdminOrders();

  return (
    <Suspense>
      <OrderManager initialOrders={orders} />
    </Suspense>
  );
}
