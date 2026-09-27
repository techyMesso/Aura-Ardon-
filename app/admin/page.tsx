import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { buildAdminDashboardOverview } from "@/lib/admin-dashboard";
import { getAdminAnalytics, listAdminDashboardData } from "@/lib/data";

export const metadata = {
  title: "Admin Dashboard | Auro Ardon",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const [{ products, orders }, analytics] = await Promise.all([
    listAdminDashboardData(),
    getAdminAnalytics()
  ]);
  const dashboard = buildAdminDashboardOverview(products, orders);

  return <AnalyticsDashboard dashboard={dashboard} analytics={analytics} products={products} />;
}
