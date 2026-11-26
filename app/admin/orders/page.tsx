import { Suspense } from "react";

import { OrderManager } from "@/components/admin/order-manager";
import { getStoreSettings, listAdminOrders, listRiders } from "@/lib/data";

export const metadata = {
  title: "Orders Admin",
  robots: { index: false, follow: false }
};

export default async function AdminOrdersPage() {
  const [orders, riders, settings] = await Promise.all([
    listAdminOrders(),
    listRiders(),
    getStoreSettings()
  ]);

  return (
    <Suspense>
      <OrderManager
        initialOrders={orders}
        initialRiders={riders}
        messageTemplates={settings.message_templates}
      />
    </Suspense>
  );
}
