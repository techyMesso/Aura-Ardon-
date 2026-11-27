import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { evaluateAlertHealth } from "@/lib/alert-health";
import { resolveAnalyticsDateRange } from "@/lib/analytics";
import { isOwnerUser, requireAdminPage } from "@/lib/auth";
import {
  countActiveAdminPushSubscriptions,
  getAnalyticsDashboardData
} from "@/lib/data";
import { getResendEnv, getWebPushVapidEnv } from "@/lib/env";

export const metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false }
};

export default async function AdminDashboardPage() {
  const adminUser = await requireAdminPage();
  const includeOwnerMetrics = isOwnerUser(adminUser);
  const initialRange = resolveAnalyticsDateRange("30d");

  const [initialReport, activePushDevices] = await Promise.all([
    getAnalyticsDashboardData({
      from: initialRange.from,
      to: initialRange.to,
      includeOwnerMetrics
    }),
    countActiveAdminPushSubscriptions()
  ]);

  const alertHealth = evaluateAlertHealth({
    resendConfigured: Boolean(getResendEnv()),
    vapidConfigured: Boolean(getWebPushVapidEnv()),
    activePushDevices
  });

  return (
    <AnalyticsDashboard
      initialPreset="30d"
      initialReport={initialReport}
      alertHealth={alertHealth}
    />
  );
}
