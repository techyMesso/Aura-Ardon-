import { Suspense } from "react";

import { OrderManager } from "@/components/admin/order-manager";
import { isOwnerUser, requireAdminPage } from "@/lib/auth";
import { getStoreSettings, listAdminOrders, listRiders } from "@/lib/data";

export const metadata = {
  title: "Orders Admin",
  robots: { index: false, follow: false }
};

export default async function AdminOrdersPage() {
  const [adminUser, orders, riders, settings] = await Promise.all([
    requireAdminPage(),
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
        isOwner={isOwnerUser(adminUser)}
      />
    </Suspense>
  );
}
