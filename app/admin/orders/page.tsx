import { Suspense } from "react";

import { OrderManager } from "@/components/admin/order-manager";
import { listAdminOrders, listRiders } from "@/lib/data";

export const metadata = {
  title: "Orders Admin",
  robots: { index: false, follow: false }
};

export default async function AdminOrdersPage() {
  const [orders, riders] = await Promise.all([
    listAdminOrders(),
    listRiders()
  ]);

  return (
    <Suspense>
      <OrderManager initialOrders={orders} initialRiders={riders} />
    </Suspense>
  );
}
