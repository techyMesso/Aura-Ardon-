import Link from "next/link";

import { listAdminOrders } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";

export const metadata = {
  title: "Invoices",
  robots: { index: false, follow: false }
};

export default async function AdminInvoicesPage() {
  const orders = await listAdminOrders();

  return (
    <section className="min-w-0 space-y-6">
      <header className="border-b border-border pb-5">
        <p className="text-sm font-medium text-brass">Records</p>
        <h2 className="mt-1 font-serif text-3xl text-text">Invoices</h2>
        <p className="mt-2 text-sm text-muted">
          Open an order invoice or gift packing slip to print or share.
        </p>
      </header>
      {orders.length ? (
        <div className="overflow-x-auto border border-border bg-paper">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-border bg-stone text-xs font-medium text-muted">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-stone/50">
                  <td className="px-4 py-4 font-medium text-text">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-4 py-4 text-text">{order.customer_name}</td>
                  <td className="px-4 py-4 text-muted">
                    {new Intl.DateTimeFormat("en-KE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric"
                    }).format(new Date(order.created_at))}
                  </td>
                  <td className="px-4 py-4 font-semibold text-text">
                    {formatCurrency(order.total)}
                  </td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/admin/invoices/${order.id}`}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-brass transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-brass"
                    >
                      Open invoice
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-dashed border-border bg-stone/50 p-8 text-center">
          <p className="font-medium text-text">No invoices yet</p>
          <p className="mt-1 text-sm text-muted">
            Invoices are created from customer orders.
          </p>
          <Link
            href="/admin/orders"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brass"
          >
            View orders
          </Link>
        </div>
      )}
    </section>
  );
}
