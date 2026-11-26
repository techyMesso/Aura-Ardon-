import { Suspense } from "react";

import { RidersHub } from "@/components/admin/riders-hub";
import {
  getDeliveryMarginReportData,
  getDispatchSheetReportData,
  listAllDeliveryZones,
  listRiders
} from "@/lib/data";
import { toNairobiDateIso } from "@/lib/invoices";

export const metadata = {
  title: "Delivery & Riders Admin",
  robots: { index: false, follow: false }
};

export default async function AdminRidersPage() {
  const todayIso = toNairobiDateIso(new Date());
  const monthStartIso = `${todayIso.slice(0, 7)}-01`;

  const [riders, zones, initialDispatchSheet, initialDeliveryMargin] =
    await Promise.all([
      listRiders(),
      listAllDeliveryZones(),
      getDispatchSheetReportData(todayIso),
      getDeliveryMarginReportData(monthStartIso, todayIso)
    ]);

  return (
    <Suspense>
      <RidersHub
        initialRiders={riders}
        deliveryZones={zones}
        initialDispatchSheet={initialDispatchSheet}
        initialDeliveryMargin={initialDeliveryMargin}
      />
    </Suspense>
  );
}

