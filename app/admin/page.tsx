import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { getAdminAnalytics } from "@/lib/data";

export const metadata = {
  title: "Admin Dashboard | Auro Ardon",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const analytics = await getAdminAnalytics();

  return <AnalyticsDashboard analytics={analytics} />;
}
