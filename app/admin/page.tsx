import { listAdminDashboardData } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Admin Dashboard | Auro Ardon",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const { orders, products } = await listAdminDashboardData();

  // Compute stats
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const totalProducts = products.length;
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-luxe backdrop-blur">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-bronze">Total Revenue</p>
          <p className="font-serif text-4xl text-ink mt-2">{formatCurrency(totalRevenue)}</p>
        </div>

        <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-luxe backdrop-blur">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-bronze">Orders</p>
          <p className="font-serif text-4xl text-ink mt-2">{totalOrders}</p>
        </div>

        <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-luxe backdrop-blur">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-bronze">Products</p>
          <p className="font-serif text-4xl text-ink mt-2">{totalProducts}</p>
        </div>

        <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-luxe backdrop-blur">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-bronze">Average Order</p>
          <p className="font-serif text-4xl text-ink mt-2">
            {totalOrders > 0 ? formatCurrency(totalRevenue / totalOrders) : formatCurrency(0)}
          </p>
        </div>
      </div>

      {/* Recent Orders */}
      <section className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-luxe backdrop-blur">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">Activity</p>
          <h2 className="font-serif text-3xl text-ink">Recent orders</h2>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-muted">No orders yet.</p>
        ) : (
          <div className="overflow-hidden rounded-[1.5rem] border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-sand/50 text-left uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/80">
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-4 text-muted">
                      {new Date(order.created_at).toLocaleDateString("en-KE")}
                    </td>
                    <td className="px-4 py-4 text-ink">
                      {order.customer_name}
                      <br />
                      <span className="text-xs text-muted">{order.customer_phone}</span>
                    </td>
                    <td className="px-4 py-4 text-ink font-medium">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-4 py-4">
                      <Badge className="capitalize">
                        {order.order_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-muted capitalize">
                      {order.payment_status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
