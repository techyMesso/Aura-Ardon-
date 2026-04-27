import { BarChart3, Package2, ReceiptText, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { AdminAnalytics } from "@/lib/types";

interface AnalyticsDashboardProps {
  analytics: AdminAnalytics;
}

function MiniLineChart({
  points
}: {
  points: Array<{ label: string; value: number }>;
}) {
  const width = 560;
  const height = 220;
  const maxValue = Math.max(...points.map(point => point.value), 1);

  const path = points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - (point.value / maxValue) * (height - 20) - 10;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-2xl border border-border bg-white/80 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
            Orders per day
          </p>
          <p className="mt-1 text-sm text-muted">Last {points.length} recorded day buckets</p>
        </div>
        <BarChart3 className="h-5 w-5 text-bronze" />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-bronze"
        />
        {points.map((point, index) => {
          const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
          const y = height - (point.value / maxValue) * (height - 20) - 10;
          return <circle key={point.label} cx={x} cy={y} r="4" className="fill-ink" />;
        })}
      </svg>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted md:grid-cols-4">
        {points.map(point => (
          <div key={point.label} className="rounded-xl border border-border/70 px-3 py-2">
            <p>{point.label}</p>
            <p className="mt-1 font-semibold text-ink">{point.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniBarChart({
  points
}: {
  points: Array<{ label: string; value: number }>;
}) {
  const maxValue = Math.max(...points.map(point => point.value), 1);

  return (
    <div className="rounded-2xl border border-border bg-white/80 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
            Top products
          </p>
          <p className="mt-1 text-sm text-muted">By units ordered</p>
        </div>
        <Package2 className="h-5 w-5 text-bronze" />
      </div>
      <div className="space-y-3">
        {points.map(point => (
          <div key={point.label} className="space-y-1">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="truncate text-ink">{point.label}</span>
              <span className="font-semibold text-ink">{point.value}</span>
            </div>
            <div className="h-2 rounded-full bg-sand">
              <div
                className="h-2 rounded-full bg-bronze"
                style={{ width: `${(point.value / maxValue) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsDashboard({ analytics }: AnalyticsDashboardProps) {
  const averageOrderValue =
    analytics.totalOrders > 0 ? analytics.revenue / analytics.totalOrders : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/50 bg-white/70 p-6 shadow-luxe backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
              Total orders
            </p>
            <ReceiptText className="h-5 w-5 text-bronze" />
          </div>
          <p className="mt-4 font-serif text-4xl text-ink">{analytics.totalOrders}</p>
        </div>

        <div className="rounded-2xl border border-white/50 bg-white/70 p-6 shadow-luxe backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
              Orders today
            </p>
            <TrendingUp className="h-5 w-5 text-bronze" />
          </div>
          <p className="mt-4 font-serif text-4xl text-ink">{analytics.ordersToday}</p>
        </div>

        <div className="rounded-2xl border border-white/50 bg-white/70 p-6 shadow-luxe backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
              Revenue
            </p>
            <BarChart3 className="h-5 w-5 text-bronze" />
          </div>
          <p className="mt-4 font-serif text-4xl text-ink">
            {formatCurrency(analytics.revenue)}
          </p>
        </div>

        <div className="rounded-2xl border border-white/50 bg-white/70 p-6 shadow-luxe backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
              Average order
            </p>
            <Package2 className="h-5 w-5 text-bronze" />
          </div>
          <p className="mt-4 font-serif text-4xl text-ink">
            {formatCurrency(averageOrderValue)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <MiniLineChart points={analytics.ordersPerDay} />
        <MiniBarChart points={analytics.topProductsChart} />
      </div>

      <section className="rounded-2xl border border-white/50 bg-white/70 p-6 shadow-luxe backdrop-blur">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">
            Product demand
          </p>
          <h2 className="mt-2 font-serif text-3xl text-ink">Most ordered products</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {analytics.mostOrderedProducts.map(product => (
            <div key={product.product_title} className="rounded-xl border border-border bg-white/80 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-ink">{product.product_title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {formatCurrency(product.revenue)} revenue
                  </p>
                </div>
                <Badge className="border-blue-200 bg-blue-100 text-blue-900">
                  {product.quantity} units
                </Badge>
              </div>
            </div>
          ))}
          {!analytics.mostOrderedProducts.length ? (
            <div className="rounded-xl border border-border bg-white/80 p-4 text-sm text-muted">
              Products will appear here after the first few orders are processed.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
