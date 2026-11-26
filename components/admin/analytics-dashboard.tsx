"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ClipboardList,
  FolderTree,
  Package,
  Plus,
  ReceiptText,
  Store,
  WalletCards
} from "lucide-react";

import {
  OrderStatusBadge,
  PaymentStatusBadge
} from "@/components/admin/order-status-badge";
import type { AdminDashboardOverview } from "@/lib/admin-dashboard";
import { getSafeCatalogImageUrl } from "@/lib/catalog";
import type { AdminAnalytics, Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface AnalyticsDashboardProps {
  dashboard: AdminDashboardOverview;
  analytics: AdminAnalytics;
  products: Product[];
}

function formatOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function StatCard({
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
  tone?: "default" | "accent";
}) {
  return (
    <article
      className={`min-w-0 border p-4 sm:p-5 ${
        tone === "accent"
          ? "border-brass/50 bg-stone"
          : "border-border bg-paper"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] bg-brass/15 text-brass">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-5 break-words font-serif text-3xl leading-none text-text sm:text-4xl">
        {value}
      </p>
      <p className="mt-2 text-sm leading-5 text-muted">{detail}</p>
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
    <div className="border border-dashed border-border bg-stone/60 p-5">
      <p className="font-medium text-text">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      <Link
        href={href}
        className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brass transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-brass"
      >
        {action}
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function LowStockList({ dashboard }: { dashboard: AdminDashboardOverview }) {
  if (!dashboard.lowStockProducts.length) {
    return (
      <EmptyState
        title="Inventory is comfortably stocked"
        description="Every tracked product is above the low-stock threshold."
        href="/admin/products"
        action="View products"
      />
    );
  }

  return (
    <div className="divide-y divide-border border border-border bg-paper">
      {dashboard.lowStockProducts.slice(0, 5).map(product => (
        <div
          key={product.id}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">{product.title}</p>
            <p
              className={`mt-0.5 text-xs ${
                product.stock_quantity === 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-700 dark:text-amber-300"
              }`}
            >
              {product.stock_quantity === 0
                ? "Out of stock"
                : `${product.stock_quantity} remaining`}
            </p>
          </div>
          <Link
            href={`/admin/products/${product.id}/edit`}
            className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-brass transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-brass"
          >
            Edit
          </Link>
        </div>
      ))}
    </div>
  );
}

function RecentOrders({ dashboard }: { dashboard: AdminDashboardOverview }) {
  if (!dashboard.recentOrders.length) {
    return (
      <EmptyState
        title="No orders yet"
        description="New customer orders will appear here as soon as they are placed."
        href="/admin/orders"
        action="Open orders"
      />
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {dashboard.recentOrders.map(order => (
          <Link
            key={order.id}
            href={`/admin/orders?order=${order.id}`}
            className="block border border-border bg-paper p-4 transition-colors hover:border-brass focus:outline-none focus:ring-2 focus:ring-brass"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-text">{order.customer_name}</p>
                <p className="mt-1 text-xs text-muted">
                  #{order.id.slice(0, 8).toUpperCase()} — {formatOrderDate(order.created_at)}
                </p>
              </div>
              <OrderStatusBadge status={order.order_status} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="font-semibold text-text">{formatCurrency(order.total)}</span>
              <PaymentStatusBadge status={order.payment_status} />
            </div>
          </Link>
        ))}
      </div>
      <div className="hidden overflow-x-auto border border-border md:block">
        <table className="w-full min-w-[660px] text-left text-sm">
          <thead className="border-b border-border bg-stone text-xs font-medium text-muted">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-paper">
            {dashboard.recentOrders.map(order => (
              <tr key={order.id} className="transition-colors hover:bg-stone/50">
                <td className="px-4 py-4 font-medium text-text">
                  <Link
                    href={`/admin/orders?order=${order.id}`}
                    className="rounded hover:text-brass focus:outline-none focus:ring-2 focus:ring-brass"
                  >
                    #{order.id.slice(0, 8).toUpperCase()}
                  </Link>
                </td>
                <td className="px-4 py-4 text-text">{order.customer_name}</td>
                <td className="px-4 py-4 text-muted">{formatOrderDate(order.created_at)}</td>
                <td className="px-4 py-4 font-semibold text-text">
                  {formatCurrency(order.total)}
                </td>
                <td className="px-4 py-4">
                  <OrderStatusBadge status={order.order_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SalesOverview({ analytics }: { analytics: AdminAnalytics }) {
  const [range, setRange] = useState<7 | 14>(14);
  const points = analytics.ordersPerDay.slice(-range);
  const maximum = Math.max(1, ...points.map(point => point.value));

  return (
    <section
      id="sales-overview"
      className="min-w-0 border border-border bg-paper p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brass">Sales overview</p>
          <h2 className="mt-1 font-serif text-3xl text-text">Order activity</h2>
          <p className="mt-1 text-sm text-muted">
            Active order revenue (excluding cancelled): {formatCurrency(analytics.revenue)}
          </p>
        </div>
        <div
          className="inline-flex min-h-11 border border-border bg-stone p-1"
          aria-label="Order activity date range"
        >
          {[7, 14].map(value => (
            <button
              key={value}
              type="button"
              onClick={() => setRange(value as 7 | 14)}
              aria-pressed={range === value}
              className={`rounded-[2px] px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brass ${
                range === value
                  ? "bg-brass text-ink"
                  : "text-muted hover:text-text"
              }`}
            >
              Last {value} days
            </button>
          ))}
        </div>
      </div>
      {points.length ? (
        <div className="mt-8">
          <div
            className="flex h-48 items-end gap-1.5 border-b border-l border-border px-3 pb-2 pt-3 sm:gap-3"
            role="img"
            aria-label={`Order activity for the last ${points.length} active days`}
          >
            {points.map(point => (
              <div
                key={point.label}
                className="group relative flex min-w-0 flex-1 flex-col justify-end"
                title={`${point.label}: ${point.value} ${point.value === 1 ? "order" : "orders"}`}
              >
                <span className="sr-only">
                  {point.label}: {point.value} {point.value === 1 ? "order" : "orders"}
                </span>
                <div
                  className="min-h-1 bg-brass transition-opacity group-hover:opacity-80"
                  style={{ height: `${Math.max(4, (point.value / maximum) * 100)}%` }}
                  aria-hidden
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between gap-3 text-xs text-muted">
            <span>{points[0]?.label}</span>
            <span>{points[points.length - 1]?.label}</span>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            title="No order activity yet"
            description="The chart will populate as customer orders arrive."
            href="/admin/products"
            action="Manage products"
          />
        </div>
      )}
    </section>
  );
}

function TopProducts({
  analytics,
  products
}: {
  analytics: AdminAnalytics;
  products: Product[];
}) {
  if (!analytics.mostOrderedProducts.length) {
    return (
      <EmptyState
        title="No product sales yet"
        description="Top products will be calculated from confirmed and active order items."
        href="/admin/products"
        action="View products"
      />
    );
  }

  return (
    <div className="divide-y divide-border border border-border bg-paper">
      {analytics.mostOrderedProducts.map(item => {
        const product = products.find(candidate => candidate.title === item.product_title);
        const image = getSafeCatalogImageUrl(product?.images[0]);
        return (
          <div
            key={item.product_title}
            className="flex min-w-0 items-center gap-3 px-4 py-3"
          >
            {image ? (
              <div className="relative h-11 w-9 shrink-0 overflow-hidden bg-stone">
                <Image src={image} alt="" aria-hidden="true" fill sizes="36px" className="object-cover" />
              </div>
            ) : (
              <span
                className="flex h-11 w-9 shrink-0 items-center justify-center bg-stone font-serif text-xs text-brass"
                aria-hidden
              >
                {item.product_title.charAt(0)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">
                {item.product_title}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {item.quantity} {item.quantity === 1 ? "unit" : "units"}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-text">
              {formatCurrency(item.revenue)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function AnalyticsDashboard({
  dashboard,
  analytics,
  products
}: AnalyticsDashboardProps) {
  const stats = [
    {
      label: "Total revenue",
      value: formatCurrency(dashboard.revenue),
      detail: "Excluding cancelled orders",
      icon: WalletCards
    },
    {
      label: "Active orders",
      value: dashboard.totalOrders,
      detail: `${analytics.ordersToday} received today (EAT)`,
      icon: ReceiptText
    },
    {
      label: "Pending orders",
      value: dashboard.pendingConfirmationOrders,
      detail: "Awaiting confirmation",
      icon: ClipboardList,
      tone: "accent" as const
    },
    {
      label: "Products",
      value: dashboard.activeProducts,
      detail: `${dashboard.lowStockProducts.length} low-stock item${
        dashboard.lowStockProducts.length === 1 ? "" : "s"
      }`,
      icon: Package
    }
  ];

  return (
    <div className="min-w-0 space-y-6">
      <section className="border-b border-border pb-6">
        <p className="text-sm font-medium text-brass">Operations overview</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-serif text-[clamp(2.25rem,8vw,3.75rem)] leading-none text-text">
              Welcome back
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
              Review live order activity, inventory pressure, and the next task for the store.
            </p>
          </div>
          <Link href="/admin/orders" className="btn-primary shrink-0">
            Review orders
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(stat => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.85fr)]">
        <SalesOverview analytics={analytics} />
        <aside className="border border-brass/40 bg-stone p-4 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[2px] bg-brass/15 text-brass">
              <AlertTriangle className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-brass">Inventory watch</p>
              <h2 className="font-serif text-2xl text-text">Low stock</h2>
            </div>
          </div>
          <LowStockList dashboard={dashboard} />
        </aside>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <div className="min-w-0 border border-border bg-paper p-4 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-brass">Fulfillment</p>
              <h2 className="mt-1 font-serif text-3xl text-text">Recent orders</h2>
            </div>
            <Link
              href="/admin/orders"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-brass transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-brass"
            >
              View all
            </Link>
          </div>
          <RecentOrders dashboard={dashboard} />
        </div>
        <div className="min-w-0 border border-border bg-paper p-4 sm:p-6">
          <div className="mb-5">
            <p className="text-sm font-medium text-brass">Sales mix</p>
            <h2 className="mt-1 font-serif text-3xl text-text">Top products</h2>
          </div>
          <TopProducts analytics={analytics} products={products} />
        </div>
      </section>

      <section className="border border-border bg-paper p-4 sm:p-6">
        <div className="mb-4">
          <p className="text-sm font-medium text-brass">Shortcuts</p>
          <h2 className="mt-1 font-serif text-2xl text-text">Quick actions</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/admin/products/new"
            className="flex min-h-12 items-center gap-2 border border-border px-3 text-sm font-medium text-text transition-colors hover:border-brass hover:bg-stone focus:outline-none focus:ring-2 focus:ring-brass"
          >
            <Plus className="h-4 w-4 text-brass" aria-hidden />
            Add product
          </Link>
          <Link
            href="/admin/categories"
            className="flex min-h-12 items-center gap-2 border border-border px-3 text-sm font-medium text-text transition-colors hover:border-brass hover:bg-stone focus:outline-none focus:ring-2 focus:ring-brass"
          >
            <FolderTree className="h-4 w-4 text-brass" aria-hidden />
            Manage categories
          </Link>
          <Link
            href="/admin/orders"
            className="flex min-h-12 items-center gap-2 border border-border px-3 text-sm font-medium text-text transition-colors hover:border-brass hover:bg-stone focus:outline-none focus:ring-2 focus:ring-brass"
          >
            <ClipboardList className="h-4 w-4 text-brass" aria-hidden />
            View orders
          </Link>
          <Link
            href="/"
            className="flex min-h-12 items-center gap-2 border border-border px-3 text-sm font-medium text-text transition-colors hover:border-brass hover:bg-stone focus:outline-none focus:ring-2 focus:ring-brass"
          >
            <Store className="h-4 w-4 text-brass" aria-hidden />
            View storefront
          </Link>
        </div>
      </section>
    </div>
  );
}
