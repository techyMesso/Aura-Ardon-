import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { resolveAnalyticsDateRange } from "@/lib/analytics";
import { isOwnerUser, requireAdminPage } from "@/lib/auth";
import { getAnalyticsDashboardData } from "@/lib/data";

export const metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false }
};

export default async function AdminDashboardPage() {
  const adminUser = await requireAdminPage();
  const includeOwnerMetrics = isOwnerUser(adminUser);
  const initialRange = resolveAnalyticsDateRange("30d");

  const initialReport = await getAnalyticsDashboardData({
    from: initialRange.from,
    to: initialRange.to,
    includeOwnerMetrics
  });

  return (
    <AnalyticsDashboard
      initialPreset="30d"
      initialReport={initialReport}
    />
  );
}
