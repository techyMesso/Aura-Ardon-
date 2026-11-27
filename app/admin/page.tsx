import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { evaluateAlertHealth } from "@/lib/alert-health";
import { resolveAnalyticsDateRange } from "@/lib/analytics";
import {
  getCurrentOwnerMfaState,
  isOwnerUser,
  requireAdminPage
} from "@/lib/auth";
import {
  countActiveAdminPushSubscriptions,
  getAnalyticsDashboardData,
  getOwnerSetupChecklistData
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

  const [initialReport, activePushDevices, ownerMfaState] = await Promise.all([
    getAnalyticsDashboardData({
      from: initialRange.from,
      to: initialRange.to,
      includeOwnerMetrics
    }),
    countActiveAdminPushSubscriptions(),
    includeOwnerMetrics
      ? getCurrentOwnerMfaState(adminUser)
      : Promise.resolve(null)
  ]);

  const alertHealth = evaluateAlertHealth({
    resendConfigured: Boolean(getResendEnv()),
    vapidConfigured: Boolean(getWebPushVapidEnv()),
    activePushDevices
  });

  const setupChecklist = includeOwnerMetrics
    ? await getOwnerSetupChecklistData({
        alertsConfigured: alertHealth.hasActiveChannel,
        ownerMfaEnabled: Boolean(ownerMfaState?.hasVerifiedFactor)
      })
    : null;

  return (
    <AnalyticsDashboard
      initialPreset="30d"
      initialReport={initialReport}
      alertHealth={alertHealth}
      setupChecklist={setupChecklist}
    />
  );
}
