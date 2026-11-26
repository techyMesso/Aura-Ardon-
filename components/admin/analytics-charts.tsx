"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  getCancelReasonLabel,
  getCanonicalStatusLabel
} from "@/lib/admin-orders";
import type {
  AnalyticsCancelReasonRow,
  AnalyticsCategoryRow,
  AnalyticsFunnel,
  AnalyticsHeatmapCell,
  AnalyticsRevenueSeriesPoint,
  AnalyticsStatusRow,
  AnalyticsTopProductRow,
  AnalyticsZoneRow,
  OrderCancelReason
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  pending: "#D97706",
  confirmed: "#2563EB",
  dispatched: "#6366F1",
  delivered: "#059669",
  cancelled: "#DC2626",
  returned: "#9333EA"
};

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const HOURS_24 = Array.from({ length: 24 }, (_, idx) => idx);

function formatCompactKes(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}

function ChartEmpty({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center border border-dashed border-border bg-stone/40 p-6 text-center">
      <p className="font-serif text-lg text-text">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted">{subtitle}</p>
    </div>
  );
}

export function ChartSkeleton({ heightClass = "h-64" }: { heightClass?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading chart"
      className={`${heightClass} w-full animate-pulse rounded-[2px] bg-stone/70`}
    />
  );
}

export function RevenueOrdersChart({
  data,
  granularity
}: {
  data: AnalyticsRevenueSeriesPoint[];
  granularity: "day" | "week";
}) {
  const hasAnyActivity = data.some(
    point =>
      point.orders > 0 ||
      point.booked_revenue > 0 ||
      point.collected_revenue > 0 ||
      point.cancelled_orders > 0
  );

  if (!data.length || !hasAnyActivity) {
    return (
      <ChartEmpty
        title="No revenue or order activity in this period"
        subtitle="Switch to a wider date range or wait for customer orders to arrive."
      />
    );
  }

  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-border"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
            minTickGap={granularity === "day" ? 18 : 8}
          />
          <YAxis
            yAxisId="revenue"
            tickFormatter={formatCompactKes}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
            width={52}
          />
          <YAxis
            yAxisId="orders"
            orientation="right"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
            width={34}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-paper, #141114)",
              border: "1px solid var(--color-border, #333)",
              borderRadius: "2px",
              fontSize: "12px"
            }}
            formatter={(value: unknown, name: unknown) => {
              const num = Number(value ?? 0);
              const label = String(name ?? "");
              if (label.includes("Revenue")) {
                return [formatCurrency(num), label];
              }
              return [num, label];
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Area
            yAxisId="revenue"
            type="monotone"
            dataKey="booked_revenue"
            name="Booked Revenue"
            stroke="#B8923E"
            fill="#B8923E"
            fillOpacity={0.18}
            strokeWidth={2}
          />
          <Area
            yAxisId="revenue"
            type="monotone"
            dataKey="collected_revenue"
            name="Collected Revenue"
            stroke="#059669"
            fill="#059669"
            fillOpacity={0.14}
            strokeWidth={2}
          />
          <Line
            yAxisId="orders"
            type="monotone"
            dataKey="orders"
            name="Active Orders"
            stroke="#6366F1"
            strokeWidth={2}
            dot={{ r: 2.5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ConversionFunnelChart({ funnel }: { funnel: AnalyticsFunnel }) {
  const steps = [
    { key: "product_views", label: "Product views", count: funnel.product_views },
    { key: "add_to_bag", label: "Add to bag", count: funnel.add_to_bag },
    { key: "begin_checkout", label: "Checkout started", count: funnel.begin_checkout },
    {
      key: "whatsapp_order_sent",
      label: "WhatsApp order sent",
      count: funnel.whatsapp_order_sent
    },
    { key: "confirmed", label: "Confirmed", count: funnel.confirmed },
    { key: "delivered", label: "Delivered", count: funnel.delivered }
  ];

  const maxCount = Math.max(...steps.map(step => step.count), 0);

  if (maxCount === 0) {
    return (
      <ChartEmpty
        title="Funnel awaiting traffic"
        subtitle="Anonymous product views, bag additions, checkout starts, and order milestones appear here automatically."
      />
    );
  }

  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const prevCount = index > 0 ? steps[index - 1].count : null;
        const stepRate =
          prevCount && prevCount > 0
            ? Math.min(100, Math.round((step.count / prevCount) * 1000) / 10)
            : null;
        const barWidth = Math.max(4, Math.round((step.count / maxCount) * 100));

        return (
          <div key={step.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-text">{step.label}</span>
              <span className="text-muted">
                <strong className="text-text">{step.count.toLocaleString("en-KE")}</strong>
                {stepRate !== null ? ` (${stepRate}% of prev)` : ""}
              </span>
            </div>
            <div className="h-6 w-full overflow-hidden rounded-[2px] bg-stone">
              <div
                className="h-full bg-brass transition-all"
                style={{ width: `${step.count > 0 ? barWidth : 0}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted">
        Product WhatsApp inquiries in this period:{" "}
        <strong className="text-text">{funnel.whatsapp_questions}</strong>
      </p>
    </div>
  );
}

export function TopProductsBarChart({
  data
}: {
  data: AnalyticsTopProductRow[];
}) {
  if (!data.length) {
    return (
      <ChartEmpty
        title="No product sales in this period"
        subtitle="Top 10 products by units, revenue, and owner profit populate from non-cancelled orders."
      />
    );
  }

  const chartData = data.slice(0, 10).map(item => ({
    name: item.title.length > 22 ? `${item.title.slice(0, 21)}…` : item.title,
    revenue: item.revenue,
    units: item.units
  }));

  return (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
          <XAxis
            type="number"
            tickFormatter={formatCompactKes}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-paper, #141114)",
              border: "1px solid var(--color-border, #333)",
              borderRadius: "2px",
              fontSize: "12px"
            }}
            formatter={(value: unknown) => [formatCurrency(Number(value ?? 0)), "Revenue"]}
          />
          <Bar dataKey="revenue" fill="#B8923E" radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategorySalesChart({ data }: { data: AnalyticsCategoryRow[] }) {
  if (!data.length) {
    return (
      <ChartEmpty
        title="No category sales yet"
        subtitle="Category revenue breakdown appears once active orders are placed."
      />
    );
  }

  return (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
          <XAxis
            dataKey="category"
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
          />
          <YAxis
            tickFormatter={formatCompactKes}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
            width={50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-paper, #141114)",
              border: "1px solid var(--color-border, #333)",
              borderRadius: "2px",
              fontSize: "12px"
            }}
            formatter={(value: unknown) => [formatCurrency(Number(value ?? 0)), "Revenue"]}
          />
          <Bar dataKey="revenue" fill="#B8923E" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DeliveryZoneChart({ data }: { data: AnalyticsZoneRow[] }) {
  if (!data.length) {
    return (
      <ChartEmpty
        title="No zone deliveries in this period"
        subtitle="Nairobi zone orders and revenue appear here as orders arrive."
      />
    );
  }

  const topZones = data.slice(0, 10);

  return (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={topZones}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
          <XAxis
            type="number"
            tickFormatter={formatCompactKes}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
          />
          <YAxis
            type="category"
            dataKey="zone"
            width={110}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-paper, #141114)",
              border: "1px solid var(--color-border, #333)",
              borderRadius: "2px",
              fontSize: "12px"
            }}
            formatter={(value: unknown, name: unknown) => {
              const label = String(name ?? "");
              return label === "Revenue"
                ? [formatCurrency(Number(value ?? 0)), label]
                : [Number(value ?? 0), label];
            }}
          />
          <Bar dataKey="revenue" name="Revenue" fill="#B8923E" radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusBreakdownChart({ data }: { data: AnalyticsStatusRow[] }) {
  if (!data.length) {
    return (
      <ChartEmpty
        title="No orders in this period"
        subtitle="Order status split updates automatically for the selected date range."
      />
    );
  }

  const pieData = data.map(item => ({
    name: getCanonicalStatusLabel(item.status),
    status: item.status,
    value: item.count,
    total: item.total
  }));

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
      <div className="h-56 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={80}
              paddingAngle={2}
            >
              {pieData.map(entry => (
                <Cell
                  key={entry.status}
                  fill={STATUS_COLORS[entry.status] ?? "#B8923E"}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-paper, #141114)",
                border: "1px solid var(--color-border, #333)",
                borderRadius: "2px",
                fontSize: "12px"
              }}
              formatter={(value: unknown, name: unknown) => [
                `${Number(value ?? 0)} order(s)`,
                String(name ?? "")
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2 text-xs">
        {pieData.map(entry => (
          <li key={entry.status} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-text">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[entry.status] ?? "#B8923E" }}
                aria-hidden
              />
              {entry.name}
            </span>
            <span className="font-semibold text-text">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CancellationsReasonChart({
  data
}: {
  data: AnalyticsCancelReasonRow[];
}) {
  if (!data.length) {
    return (
      <ChartEmpty
        title="Zero cancellations in this period"
        subtitle="Cancellation reasons and lost order value appear here if any orders are cancelled."
      />
    );
  }

  const chartData = data.map(row => ({
    label: getCancelReasonLabel(
      row.reason === "unspecified" ? null : (row.reason as OrderCancelReason)
    ),
    count: row.count,
    lost_value: row.lost_value
  }));

  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
          />
          <YAxis
            type="category"
            dataKey="label"
            width={135}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-paper, #141114)",
              border: "1px solid var(--color-border, #333)",
              borderRadius: "2px",
              fontSize: "12px"
            }}
            formatter={(value: unknown) => [`${Number(value ?? 0)} order(s)`, "Cancelled"]}
          />
          <Bar dataKey="count" fill="#DC2626" radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BusiestTimesHeatmap({ cells }: { cells: AnalyticsHeatmapCell[] }) {
  if (!cells.length) {
    return (
      <ChartEmpty
        title="No order timestamps in this period"
        subtitle="Busiest days and hours (Africa/Nairobi EAT) populate as orders arrive."
      />
    );
  }

  const lookup = new Map<string, AnalyticsHeatmapCell>();
  let maxOrders = 1;
  for (const cell of cells) {
    lookup.set(`${cell.dow}-${cell.hour}`, cell);
    if (cell.orders > maxOrders) maxOrders = cell.orders;
  }

  return (
    <div className="space-y-3 overflow-x-auto">
      <div className="min-w-[620px]">
        <div className="mb-1.5 grid grid-cols-[44px_repeat(24,minmax(0,1fr))] gap-1 text-center text-[10px] text-muted">
          <span />
          {HOURS_24.map(hour => (
            <span key={hour}>
              {hour % 3 === 0 ? `${String(hour).padStart(2, "0")}` : ""}
            </span>
          ))}
        </div>
        <div className="space-y-1">
          {DAYS_OF_WEEK.map((dayLabel, dow) => (
            <div
              key={dayLabel}
              className="grid grid-cols-[44px_repeat(24,minmax(0,1fr))] items-center gap-1"
            >
              <span className="text-xs font-medium text-muted">{dayLabel}</span>
              {HOURS_24.map(hour => {
                const cell = lookup.get(`${dow}-${hour}`);
                const count = cell?.orders ?? 0;
                const intensity = count > 0 ? Math.max(0.18, count / maxOrders) : 0;
                return (
                  <div
                    key={hour}
                    title={`${dayLabel} ${String(hour).padStart(2, "0")}:00 EAT — ${count} order(s)${
                      cell ? ` (${formatCurrency(cell.revenue)})` : ""
                    }`}
                    className="h-6 rounded-[2px] border border-border/50 transition"
                    style={{
                      backgroundColor:
                        count > 0
                          ? `rgba(184, 146, 62, ${intensity.toFixed(2)})`
                          : "transparent"
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>All hours shown in Africa/Nairobi (EAT).</span>
        <div className="flex items-center gap-1.5">
          <span>Quiet</span>
          {[0, 0.25, 0.55, 0.85, 1].map(alpha => (
            <span
              key={alpha}
              className="h-3 w-3 rounded-[2px] border border-border/60"
              style={{
                backgroundColor:
                  alpha === 0 ? "transparent" : `rgba(184, 146, 62, ${alpha})`
              }}
              aria-hidden
            />
          ))}
          <span>Peak</span>
        </div>
      </div>
    </div>
  );
}

