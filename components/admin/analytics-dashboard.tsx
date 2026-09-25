import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  PackageCheck,
  PackageOpen,
  ReceiptText,
  WalletCards
} from "lucide-react";

import {
  OrderStatusBadge,
  PaymentStatusBadge
} from "@/components/admin/order-status-badge";
import type { AdminDashboardOverview } from "@/lib/admin-dashboard";
import { formatCurrency } from "@/lib/utils";

interface AnalyticsDashboardProps {
  dashboard: AdminDashboardOverview;
}

function AdminStatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default"
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof WalletCards;
  tone?: "default" | "attention";
}) {
  return (
    <article
      className={`rounded-[1.75rem] border p-5 shadow-card backdrop-blur-sm ${
        tone === "attention"
          ? "border-rose/25 bg-sand/50"
          : "border-white/65 bg-card/80"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">{label}</p>
        <span className="rounded-full bg-bronze/10 p-2 text-bronze">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-5 font-serif text-3xl text-ink sm:text-4xl">{value}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </article>
  );
}

function EmptyState({
  title,
  description,
  href,
  action
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border bg-cream/70 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-bronze transition hover:text-rose"
      >
        {action}
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

function formatOrderDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function LowStockAlert({ dashboard }: { dashboard: AdminDashboardOverview }) {
  if (!dashboard.lowStockProducts.length) {
    return (
      <EmptyState
        title={dashboard.activeProducts ? "Inventory is comfortably stocked" : "No products to monitor yet"}
        description={
          dashboard.activeProducts
            ? "Every product is above the low-stock threshold of five pieces."
            : "Add your first jewelry piece to begin tracking inventory."
        }
        href={dashboard.activeProducts ? "/admin/products" : "/admin/products/new"}
        action={dashboard.activeProducts ? "View inventory" : "Add product"}
      />
    );
  }

  return (
    <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-white/75">
      {dashboard.lowStockProducts.map(product => (
        <div key={product.id} className="flex items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{product.title}</p>
            <p className="mt-1 text-sm text-muted">
              {product.stock_quantity === 0
                ? "Out of stock"
                : `${product.stock_quantity} ${product.stock_quantity === 1 ? "piece" : "pieces"} remaining`}
            </p>
          </div>
          <Link
            href={`/admin/products/${product.id}/edit`}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-bronze transition hover:text-rose"
          >
            Edit
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsDashboard({ dashboard }: AnalyticsDashboardProps) {
  const stats = [
    {
      label: "Revenue",
      value: formatCurrency(dashboard.revenue),
      detail: "Across all recorded orders",
      icon: WalletCards
    },
    {
      label: "Order count",
      value: dashboard.totalOrders,
      detail: "Orders received to date",
      icon: ReceiptText
    },
    {
      label: "Pending confirmation",
      value: dashboard.pendingConfirmationOrders,
      detail: "Orders awaiting your reply",
      icon: Clock3,
      tone: "attention" as const
    },
    {
      label: "Delivered",
      value: dashboard.deliveredOrders,
      detail: "Successfully fulfilled orders",
      icon: CheckCircle2
    },
    {
      label: "Active products",
      value: dashboard.activeProducts,
      detail: "Visible in the storefront",
      icon: PackageCheck
    },
    {
      label: "Low stock",
      value: dashboard.lowStockProducts.length,
      detail: "At five pieces or fewer",
      icon: AlertTriangle,
      tone: dashboard.lowStockProducts.length ? ("attention" as const) : undefined
    }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/65 bg-gradient-card p-6 shadow-luxe backdrop-blur sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-bronze">Dashboard overview</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-serif text-4xl text-ink sm:text-5xl">Today&apos;s atelier pulse</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
              A focused view of sales, fulfillment, and inventory that need your attention.
            </p>
          </div>
          <Link
            href="/admin/orders"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-bronze px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-white shadow-card transition hover:bg-rose"
          >
            Review orders
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(stat => (
          <AdminStatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
        <div className="rounded-[2rem] border border-white/65 bg-white/75 p-5 shadow-card backdrop-blur sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">Fulfillment</p>
              <h3 className="mt-2 font-serif text-3xl text-ink">Recent orders</h3>
            </div>
            <Link href="/admin/orders" className="text-sm font-semibold text-bronze transition hover:text-rose">
              View all
            </Link>
          </div>

          {dashboard.recentOrders.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-left text-sm">
                <thead className="border-y border-border/70 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  <tr>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Total</th>
                    <th className="px-3 py-3">Payment</th>
                    <th className="px-3 py-3">Order</th>
                    <th className="px-3 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {dashboard.recentOrders.map(order => (
                    <tr key={order.id} className="transition hover:bg-sand/20">
                      <td className="px-3 py-4 font-medium text-ink">
                        <Link href={`/admin/orders?order=${order.id}`} className="transition hover:text-bronze">
                          {order.customer_name}
                        </Link>
                      </td>
                      <td className="px-3 py-4 font-semibold text-ink">{formatCurrency(order.total)}</td>
                      <td className="px-3 py-4"><PaymentStatusBadge status={order.payment_status} /></td>
                      <td className="px-3 py-4">
                        <OrderStatusBadge status={order.order_status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-muted">{formatOrderDate(order.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No orders have arrived yet"
              description="New customer orders will appear here as soon as they are placed."
              href="/admin/orders"
              action="Open orders"
            />
          )}
        </div>

        <aside className="rounded-[2rem] border border-rose/20 bg-gradient-warm p-5 shadow-card sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="rounded-full bg-rose/10 p-2 text-rose">
              <PackageOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">Inventory watch</p>
              <h3 className="mt-2 font-serif text-3xl text-ink">Low-stock alerts</h3>
            </div>
          </div>
          <LowStockAlert dashboard={dashboard} />
        </aside>
      </section>
    </div>
  );
}
