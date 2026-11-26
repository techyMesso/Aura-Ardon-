"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FolderTree,
  Package,
  Plus,
  RefreshCw,
  Store,
  TrendingUp,
  X
} from "lucide-react";

import {
  BusiestTimesHeatmap,
  CancellationsReasonChart,
  CategorySalesChart,
  ChartSkeleton,
  ConversionFunnelChart,
  DeliveryZoneChart,
  RevenueOrdersChart,
  StatusBreakdownChart,
  TopProductsBarChart
} from "@/components/admin/analytics-charts";
import {
  OrderStatusBadge,
  PaymentStatusBadge
} from "@/components/admin/order-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCancelReasonLabel } from "@/lib/admin-orders";
import {
  buildCsvContent,
  computePercentDelta,
  formatHoursDuration
} from "@/lib/analytics";
import type {
  AnalyticsDashboardReport,
  AnalyticsDatePreset,
  OrderCancelReason
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface AnalyticsDashboardProps {
  initialPreset: AnalyticsDatePreset;
  initialReport: AnalyticsDashboardReport;
}

type InventoryTab = "out_of_stock" | "low_stock" | "at_risk" | "dead_stock" | "sell_through";

const DATE_PRESETS: ReadonlyArray<{ id: AnalyticsDatePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "this_month", label: "This month" },
  { id: "custom", label: "Custom" }
];

function downloadCsvFile(
  filename: string,
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>
) {
  const csv = buildCsvContent(headers, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function DeltaBadge({
  current,
  previous,
  invertGood = false
}: {
  current: number | null | undefined;
  previous: number | null | undefined;
  invertGood?: boolean;
}) {
  const delta = computePercentDelta(current, previous);
  if (delta.direction === "na" || delta.deltaPct === null) {
    return <span className="text-xs text-muted">vs prev: —</span>;
  }
  if (delta.direction === "flat") {
    return <span className="text-xs text-muted">0% vs prev</span>;
  }
  const isPositive = delta.direction === "up";
  const isGood = invertGood ? !isPositive : isPositive;
  const arrow = isPositive ? "▲" : "▼";
  const absPct = Math.abs(delta.deltaPct).toFixed(1);

  return (
    <span
      className={`inline-flex items-center text-xs font-semibold ${
        isGood
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      {arrow} {absPct}% vs prev
    </span>
  );
}

function CsvExportButton({
  label = "Export CSV",
  onClick,
  disabled = false
}: {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-[2px] border border-border bg-paper px-2.5 text-xs font-medium text-text transition hover:border-brass hover:text-brass disabled:opacity-40"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

function formatNairobiDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function AnalyticsDashboard({
  initialPreset,
  initialReport
}: AnalyticsDashboardProps) {
  const [preset, setPreset] = useState<AnalyticsDatePreset>(initialPreset);
  const [customFrom, setCustomFrom] = useState(initialReport.range.from);
  const [customTo, setCustomTo] = useState(initialReport.range.to);
  const [report, setReport] = useState<AnalyticsDashboardReport>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventoryTab, setInventoryTab] = useState<InventoryTab>("out_of_stock");

  // Quick "Adjust stock" modal state
  const [adjustTarget, setAdjustTarget] = useState<{
    id: string;
    title: string;
    stock_quantity: number;
  } | null>(null);
  const [adjustChange, setAdjustChange] = useState("5");
  const [adjustNote, setAdjustNote] = useState("Restock from supplier");
  const [savingStock, setSavingStock] = useState(false);
  const [stockSuccess, setStockSuccess] = useState<string | null>(null);

  async function fetchReport(
    nextPreset: AnalyticsDatePreset,
    nextFrom = customFrom,
    nextTo = customTo
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ preset: nextPreset });
      if (nextPreset === "custom") {
        params.set("from", nextFrom);
        params.set("to", nextTo);
      }
      const response = await fetch(`/api/admin/analytics?${params.toString()}`);
      const payload = (await response.json()) as {
        report?: AnalyticsDashboardReport;
        error?: string;
      };
      if (!response.ok || !payload.report) {
        throw new Error(payload.error ?? "Unable to load analytics.");
      }
      setReport(payload.report);
      setCustomFrom(payload.report.range.from);
      setCustomTo(payload.report.range.to);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to load analytics."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPreset(nextPreset: AnalyticsDatePreset) {
    setPreset(nextPreset);
    if (nextPreset !== "custom") {
      void fetchReport(nextPreset);
    }
  }

  async function handleSubmitQuickStockAdjust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustTarget) return;

    const parsedDelta = Number.parseInt(adjustChange, 10);
    if (!Number.isInteger(parsedDelta) || parsedDelta === 0) {
      setError("Enter a non-zero integer stock change (e.g. 5 or -2).");
      return;
    }
    if (!adjustNote.trim()) {
      setError("A note is required for every stock adjustment.");
      return;
    }

    setSavingStock(true);
    setError(null);
    setStockSuccess(null);

    try {
      const response = await fetch(`/api/admin/products/${adjustTarget.id}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          change: parsedDelta,
          note: adjustNote.trim(),
          type: "manual_adjustment"
        })
      });
      const payload = (await response.json()) as {
        newStockQuantity?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to adjust stock.");
      }

      setStockSuccess(
        `Updated ${adjustTarget.title} stock to ${
          payload.newStockQuantity ?? adjustTarget.stock_quantity + parsedDelta
        } units.`
      );
      setAdjustTarget(null);
      await fetchReport(preset, customFrom, customTo);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to adjust stock."
      );
    } finally {
      setSavingStock(false);
    }
  }

  const { kpis, previous_kpis: prev, needs_attention: attention, inventory } = report;
  const totalAttentionCount =
    attention.pending_over_24h_count +
    attention.out_of_stock_best_sellers_count +
    attention.dispatched_over_3d_count +
    attention.unpaid_delivered_invoices_count +
    attention.reviews_pending_moderation_count;

  const dateTag = `${report.range.from}-to-${report.range.to}`;

  return (
    <div className="min-w-0 space-y-6">
      {/* Header & Date Range Controls */}
      <section className="space-y-4 border-b border-border pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-brass">
              Operations &amp; Analytics · Africa/Nairobi (EAT)
            </p>
            <h2 className="mt-1 font-serif text-[clamp(2rem,6vw,3.25rem)] leading-none text-text">
              Store performance
            </h2>
            <p className="mt-2 text-xs text-muted sm:text-sm">
              Showing{" "}
              <strong className="text-text">
                {report.range.from} → {report.range.to}
              </strong>{" "}
              ({report.range.days} {report.range.days === 1 ? "day" : "days"},{" "}
              {report.range.granularity} buckets) vs previous{" "}
              {report.range.previous_from} → {report.range.previous_to}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Analytics date range preset"
              className="flex flex-wrap gap-1 border border-border bg-stone p-1"
            >
              {DATE_PRESETS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelectPreset(option.id)}
                  aria-pressed={preset === option.id}
                  className={`min-h-9 rounded-[2px] px-3 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-brass sm:text-sm ${
                    preset === option.id
                      ? "bg-brass text-ink"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => void fetchReport(preset, customFrom, customTo)}
              aria-label="Refresh analytics"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden
              />
            </Button>
          </div>
        </div>

        {preset === "custom" ? (
          <form
            onSubmit={event => {
              event.preventDefault();
              void fetchReport("custom", customFrom, customTo);
            }}
            className="flex flex-wrap items-end gap-3 border border-border bg-stone/40 p-3.5"
          >
            <label className="space-y-1 text-xs text-muted">
              <span>From (EAT)</span>
              <Input
                type="date"
                value={customFrom}
                onChange={event => setCustomFrom(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-xs text-muted">
              <span>To (EAT)</span>
              <Input
                type="date"
                value={customTo}
                onChange={event => setCustomTo(event.target.value)}
                required
              />
            </label>
            <Button type="submit" disabled={loading}>
              {loading ? "Loading..." : "Apply range"}
            </Button>
          </form>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        ) : null}
        {stockSuccess ? (
          <p
            aria-live="polite"
            className="rounded-[2px] border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
          >
            {stockSuccess}
          </p>
        ) : null}
      </section>

      {/* ─── NEEDS ATTENTION BOX ────────────────────────────── */}
      <section
        aria-label="Needs attention"
        className={`border p-4 sm:p-5 ${
          totalAttentionCount > 0
            ? "border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20"
            : "border-emerald-400/40 bg-emerald-500/5"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {totalAttentionCount > 0 ? (
              <AlertTriangle
                className="h-5 w-5 text-amber-700 dark:text-amber-300"
                aria-hidden
              />
            ) : (
              <CheckCircle2
                className="h-5 w-5 text-emerald-700 dark:text-emerald-300"
                aria-hidden
              />
            )}
            <h3 className="font-serif text-2xl text-text">
              Needs attention ({totalAttentionCount})
            </h3>
          </div>
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brass hover:underline"
          >
            Open orders queue
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {/* 1. Pending > 24h */}
          <article className="border border-border bg-paper p-3.5">
            <p className="text-xs font-medium text-muted">Pending &gt; 24h</p>
            <p className="mt-1 font-serif text-2xl text-text">
              {attention.pending_over_24h_count}
            </p>
            {attention.pending_over_24h.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs">
                {attention.pending_over_24h.slice(0, 3).map(item => (
                  <li key={item.id} className="truncate">
                    <Link
                      href={`/admin/orders?order=${item.id}`}
                      className="font-medium text-brass hover:underline"
                    >
                      {item.order_number}
                    </Link>{" "}
                    <span className="text-muted">{item.customer_name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted">All clear</p>
            )}
          </article>

          {/* 2. Out-of-stock best sellers */}
          <article className="border border-border bg-paper p-3.5">
            <p className="text-xs font-medium text-muted">Out-of-stock best sellers</p>
            <p className="mt-1 font-serif text-2xl text-text">
              {attention.out_of_stock_best_sellers_count}
            </p>
            {attention.out_of_stock_best_sellers.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs">
                {attention.out_of_stock_best_sellers.slice(0, 3).map(item => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/admin/products/${item.id}/edit`}
                      className="truncate font-medium text-brass hover:underline"
                    >
                      {item.title}
                    </Link>
                    <span className="shrink-0 text-muted">{item.units_30d}/30d</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted">Best sellers stocked</p>
            )}
          </article>

          {/* 3. Dispatched > 3 days */}
          <article className="border border-border bg-paper p-3.5">
            <p className="text-xs font-medium text-muted">Dispatched &gt; 3d</p>
            <p className="mt-1 font-serif text-2xl text-text">
              {attention.dispatched_over_3d_count}
            </p>
            {attention.dispatched_over_3d.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs">
                {attention.dispatched_over_3d.slice(0, 3).map(item => (
                  <li key={item.id} className="truncate">
                    <Link
                      href={`/admin/orders?order=${item.id}`}
                      className="font-medium text-brass hover:underline"
                    >
                      {item.order_number}
                    </Link>{" "}
                    <span className="text-muted">
                      {item.rider_name ? `(${item.rider_name})` : item.customer_name}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted">No overdue deliveries</p>
            )}
          </article>

          {/* 4. Unpaid delivered invoices */}
          <article className="border border-border bg-paper p-3.5">
            <p className="text-xs font-medium text-muted">Unpaid delivered invoices</p>
            <p className="mt-1 font-serif text-2xl text-text">
              {attention.unpaid_delivered_invoices_count}
            </p>
            {attention.unpaid_delivered_invoices_count > 0 ? (
              <p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                {formatCurrency(attention.unpaid_delivered_invoices_total)} due{" "}
                <Link href="/admin/invoices" className="underline">
                  View
                </Link>
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted">All delivered orders paid</p>
            )}
          </article>

          {/* 5. Reviews awaiting moderation */}
          <article className="border border-border bg-paper p-3.5">
            <p className="text-xs font-medium text-muted">Reviews waiting moderation</p>
            <p className="mt-1 font-serif text-2xl text-text">
              {attention.reviews_pending_moderation_count}
            </p>
            <p className="mt-1 text-xs text-muted">
              {attention.reviews_pending_moderation_count > 0
                ? "Verified customer reviews ready to approve"
                : "No pending reviews"}
            </p>
          </article>
        </div>
      </section>

      {/* ─── 10 KPI CARDS (WITH ▲/▼ % DELTAS) ──────────────── */}
      <section aria-label="Key performance indicators">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <ChartSkeleton key={i} heightClass="h-32" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {/* 1. Booked revenue */}
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">
                Booked revenue
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatCurrency(kpis.booked_revenue)}
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                <DeltaBadge
                  current={kpis.booked_revenue}
                  previous={prev.booked_revenue}
                />
                <span className="text-[11px] text-muted">
                  Confirmed + dispatched + delivered (excl. delivery)
                </span>
              </div>
            </article>

            {/* 2. Collected revenue */}
            <article className="border border-brass/40 bg-stone/50 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-brass">
                Collected revenue
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatCurrency(kpis.collected_revenue)}
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                <DeltaBadge
                  current={kpis.collected_revenue}
                  previous={prev.collected_revenue}
                />
                <span className="text-[11px] text-muted">
                  Delivered orders minus returns
                </span>
              </div>
            </article>

            {/* 3. Delivery fees & margin */}
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">
                Delivery fees &amp; margin
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatCurrency(kpis.delivery_fees_collected)}
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                <DeltaBadge
                  current={kpis.delivery_margin}
                  previous={prev.delivery_margin}
                />
                <span className="text-[11px] text-muted">
                  Margin:{" "}
                  <strong className="text-text">
                    {formatCurrency(kpis.delivery_margin)}
                  </strong>{" "}
                  (rider costs {formatCurrency(kpis.delivery_rider_costs)})
                </span>
              </div>
            </article>

            {/* 4. Gross profit & margin (OWNER ONLY) */}
            {report.include_owner_metrics ? (
              <article className="border border-border bg-paper p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-brass">
                  Gross profit (Owner)
                </p>
                <p className="mt-2 font-serif text-2xl text-text">
                  {formatCurrency(kpis.gross_profit ?? 0)}
                </p>
                <div className="mt-2 flex flex-col gap-0.5">
                  <DeltaBadge
                    current={kpis.gross_profit}
                    previous={prev.gross_profit}
                  />
                  <span className="text-[11px] text-muted">
                    Margin:{" "}
                    <strong className="text-text">
                      {kpis.gross_margin_pct !== null
                        ? `${kpis.gross_margin_pct.toFixed(1)}%`
                        : "—"}
                    </strong>
                    {(kpis.items_missing_cost ?? 0) > 0
                      ? ` · ${kpis.items_missing_cost} line(s) missing cost`
                      : ""}
                  </span>
                </div>
              </article>
            ) : null}

            {/* 5. Orders & AOV */}
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">
                Orders &amp; AOV
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {kpis.orders_total}{" "}
                <span className="font-sans text-sm font-normal text-muted">
                  ({formatCurrency(kpis.aov)} AOV)
                </span>
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                <DeltaBadge
                  current={kpis.orders_total}
                  previous={prev.orders_total}
                />
                <span className="text-[11px] text-muted">
                  {kpis.orders_by_status.pending} pend · {kpis.orders_by_status.confirmed}{" "}
                  conf · {kpis.orders_by_status.dispatched} disp ·{" "}
                  {kpis.orders_by_status.delivered} deliv
                </span>
              </div>
            </article>

            {/* 6. Confirmation rate */}
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">
                Confirmation rate
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {kpis.confirmation_rate.toFixed(1)}%
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                <DeltaBadge
                  current={kpis.confirmation_rate}
                  previous={prev.confirmation_rate}
                />
                <span className="text-[11px] text-muted">Pending → Confirmed</span>
              </div>
            </article>

            {/* 7. Cancellation & return rate */}
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">
                Cancel &amp; return rate
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {kpis.cancellation_rate.toFixed(1)}%{" "}
                <span className="font-sans text-sm font-normal text-muted">
                  / {kpis.return_rate.toFixed(1)}%
                </span>
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                <DeltaBadge
                  current={kpis.cancellation_rate}
                  previous={prev.cancellation_rate}
                  invertGood
                />
                <span className="text-[11px] text-muted">
                  {kpis.orders_by_status.cancelled} cancelled ·{" "}
                  {kpis.orders_by_status.returned} returned
                </span>
              </div>
            </article>

            {/* 8. Avg time to confirm & deliver */}
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">
                Fulfillment speed
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatHoursDuration(kpis.avg_hours_to_confirm)}{" "}
                <span className="font-sans text-sm font-normal text-muted">
                  / {formatHoursDuration(kpis.avg_hours_to_deliver)}
                </span>
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                <DeltaBadge
                  current={kpis.avg_hours_to_deliver}
                  previous={prev.avg_hours_to_deliver}
                  invertGood
                />
                <span className="text-[11px] text-muted">
                  Avg confirm / avg deliver time
                </span>
              </div>
            </article>

            {/* 9. New vs returning customers */}
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">
                New vs returning
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {kpis.new_customers}{" "}
                <span className="font-sans text-sm font-normal text-muted">
                  new · {kpis.returning_customers} ret
                </span>
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                <DeltaBadge
                  current={kpis.new_customers + kpis.returning_customers}
                  previous={prev.new_customers + prev.returning_customers}
                />
                <span className="text-[11px] text-muted">Unique active customers</span>
              </div>
            </article>

            {/* 10. Discounts given */}
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">
                Discounts given
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatCurrency(kpis.discounts_given)}
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                <DeltaBadge
                  current={kpis.discounts_given}
                  previous={prev.discounts_given}
                  invertGood
                />
                <span className="text-[11px] text-muted">
                  {kpis.discounts_by_code.length} active promo code(s) used
                </span>
              </div>
            </article>
          </div>
        )}
      </section>

      {/* ─── CHART 1 & CHART 2: REVENUE OVER TIME + FUNNEL ─── */}
      <section
        id="sales-overview"
        className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.95fr)]"
      >
        <div className="min-w-0 border border-border bg-paper p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Revenue &amp; orders ({report.range.granularity === "day" ? "Daily" : "Weekly"} EAT)
              </p>
              <h3 className="mt-1 font-serif text-2xl text-text">
                Revenue &amp; orders over time
              </h3>
            </div>
            <CsvExportButton
              disabled={report.revenue_series.length === 0}
              onClick={() =>
                downloadCsvFile(
                  `auro-ardon-revenue-series-${dateTag}.csv`,
                  [
                    "Bucket (EAT)",
                    "Label",
                    "Active Orders",
                    "Cancelled Orders",
                    "Booked Revenue (KES)",
                    "Collected Revenue (KES)"
                  ],
                  report.revenue_series.map(pt => [
                    pt.bucket,
                    pt.label,
                    pt.orders,
                    pt.cancelled_orders,
                    pt.booked_revenue.toFixed(2),
                    pt.collected_revenue.toFixed(2)
                  ])
                )
              }
            />
          </div>
          {loading ? (
            <ChartSkeleton heightClass="h-72" />
          ) : (
            <RevenueOrdersChart
              data={report.revenue_series}
              granularity={report.range.granularity}
            />
          )}
        </div>

        <div className="min-w-0 border border-border bg-paper p-4 sm:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
              Storefront conversion
            </p>
            <h3 className="mt-1 font-serif text-2xl text-text">
              Shopping funnel
            </h3>
          </div>
          {loading ? (
            <ChartSkeleton heightClass="h-72" />
          ) : (
            <ConversionFunnelChart funnel={report.funnel} />
          )}
        </div>
      </section>

      {/* ─── CHART 3 & CHART 4: TOP 10 PRODUCTS + CATEGORIES ── */}
      <section className="grid min-w-0 gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-4 border border-border bg-paper p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Top 10 performers
              </p>
              <h3 className="mt-1 font-serif text-2xl text-text">Top products</h3>
            </div>
            <CsvExportButton
              disabled={report.top_products.length === 0}
              onClick={() =>
                downloadCsvFile(
                  `auro-ardon-top-products-${dateTag}.csv`,
                  report.include_owner_metrics
                    ? ["Product", "Category", "Units", "Revenue (KES)", "Profit (KES)", "Margin %"]
                    : ["Product", "Category", "Units", "Revenue (KES)"],
                  report.top_products.map(item =>
                    report.include_owner_metrics
                      ? [
                          item.title,
                          item.category,
                          item.units,
                          item.revenue.toFixed(2),
                          item.profit !== null ? item.profit.toFixed(2) : "",
                          item.margin_pct !== null ? `${item.margin_pct}%` : ""
                        ]
                      : [item.title, item.category, item.units, item.revenue.toFixed(2)]
                  )
                )
              }
            />
          </div>
          {loading ? (
            <ChartSkeleton />
          ) : (
            <>
              <TopProductsBarChart data={report.top_products} />
              {report.top_products.length > 0 ? (
                <div className="overflow-x-auto border border-border">
                  <table className="min-w-[460px] w-full divide-y divide-border text-left text-xs">
                    <thead className="bg-stone uppercase tracking-[0.1em] text-muted">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2 text-right">Units</th>
                        <th className="px-3 py-2 text-right">Revenue</th>
                        {report.include_owner_metrics ? (
                          <th className="px-3 py-2 text-right">Profit</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.top_products.map((item, idx) => (
                        <tr key={item.product_id ?? `${item.title}-${idx}`}>
                          <td className="px-3 py-2 font-medium text-text">
                            {item.title}
                          </td>
                          <td className="px-3 py-2 text-right text-muted">
                            {item.units}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-text">
                            {formatCurrency(item.revenue)}
                          </td>
                          {report.include_owner_metrics ? (
                            <td className="px-3 py-2 text-right font-medium text-emerald-700 dark:text-emerald-300">
                              {item.profit !== null
                                ? `${formatCurrency(item.profit)} (${item.margin_pct ?? 0}%)`
                                : "—"}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="min-w-0 space-y-4 border border-border bg-paper p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Catalog mix
              </p>
              <h3 className="mt-1 font-serif text-2xl text-text">Sales by category</h3>
            </div>
            <CsvExportButton
              disabled={report.sales_by_category.length === 0}
              onClick={() =>
                downloadCsvFile(
                  `auro-ardon-sales-by-category-${dateTag}.csv`,
                  ["Category", "Orders", "Units", "Revenue (KES)"],
                  report.sales_by_category.map(row => [
                    row.category,
                    row.orders,
                    row.units,
                    row.revenue.toFixed(2)
                  ])
                )
              }
            />
          </div>
          {loading ? (
            <ChartSkeleton />
          ) : (
            <>
              <CategorySalesChart data={report.sales_by_category} />
              {report.sales_by_category.length > 0 ? (
                <div className="overflow-x-auto border border-border">
                  <table className="min-w-[380px] w-full divide-y divide-border text-left text-xs">
                    <thead className="bg-stone uppercase tracking-[0.1em] text-muted">
                      <tr>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2 text-right">Orders</th>
                        <th className="px-3 py-2 text-right">Units</th>
                        <th className="px-3 py-2 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.sales_by_category.map(row => (
                        <tr key={row.category}>
                          <td className="px-3 py-2 font-medium text-text">
                            {row.category}
                          </td>
                          <td className="px-3 py-2 text-right text-muted">
                            {row.orders}
                          </td>
                          <td className="px-3 py-2 text-right text-muted">{row.units}</td>
                          <td className="px-3 py-2 text-right font-medium text-text">
                            {formatCurrency(row.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      {/* ─── CHART 5, 7, 8: ZONES + STATUS + CANCELLATIONS ──── */}
      <section className="grid min-w-0 gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-4 border border-border bg-paper p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Nairobi &amp; courier demand
              </p>
              <h3 className="mt-1 font-serif text-2xl text-text">
                Orders &amp; revenue by delivery zone
              </h3>
            </div>
            <CsvExportButton
              disabled={report.sales_by_zone.length === 0}
              onClick={() =>
                downloadCsvFile(
                  `auro-ardon-sales-by-zone-${dateTag}.csv`,
                  [
                    "Zone",
                    "Orders",
                    "Revenue (KES)",
                    "Delivery Fees (KES)",
                    "Rider Costs (KES)",
                    "Delivery Margin (KES)"
                  ],
                  report.sales_by_zone.map(row => [
                    row.zone,
                    row.orders,
                    row.revenue.toFixed(2),
                    row.delivery_fees.toFixed(2),
                    row.rider_costs.toFixed(2),
                    row.delivery_margin.toFixed(2)
                  ])
                )
              }
            />
          </div>
          {loading ? (
            <ChartSkeleton />
          ) : (
            <>
              <DeliveryZoneChart data={report.sales_by_zone} />
              {report.sales_by_zone.length > 0 ? (
                <div className="overflow-x-auto border border-border">
                  <table className="min-w-[460px] w-full divide-y divide-border text-left text-xs">
                    <thead className="bg-stone uppercase tracking-[0.1em] text-muted">
                      <tr>
                        <th className="px-3 py-2">Zone</th>
                        <th className="px-3 py-2 text-right">Orders</th>
                        <th className="px-3 py-2 text-right">Revenue</th>
                        <th className="px-3 py-2 text-right">Deliv. margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.sales_by_zone.map(row => (
                        <tr key={row.zone}>
                          <td className="px-3 py-2 font-medium text-text">{row.zone}</td>
                          <td className="px-3 py-2 text-right text-muted">
                            {row.orders}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-text">
                            {formatCurrency(row.revenue)}
                          </td>
                          <td className="px-3 py-2 text-right text-muted">
                            {formatCurrency(row.delivery_margin)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          {/* Status breakdown */}
          <div className="border border-border bg-paper p-4 sm:p-6">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Order pipeline
              </p>
              <h3 className="mt-1 font-serif text-2xl text-text">
                Order status breakdown
              </h3>
            </div>
            {loading ? (
              <ChartSkeleton heightClass="h-56" />
            ) : (
              <StatusBreakdownChart data={report.status_breakdown} />
            )}
          </div>

          {/* Cancellations by reason */}
          <div className="border border-border bg-paper p-4 sm:p-6">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                  Loss diagnosis
                </p>
                <h3 className="mt-1 font-serif text-2xl text-text">
                  Cancellations by reason
                </h3>
              </div>
              <CsvExportButton
                disabled={report.cancellations_by_reason.length === 0}
                onClick={() =>
                  downloadCsvFile(
                    `auro-ardon-cancellations-${dateTag}.csv`,
                    ["Reason", "Count", "Lost Value (KES)"],
                    report.cancellations_by_reason.map(row => [
                      getCancelReasonLabel(
                        row.reason === "unspecified"
                          ? null
                          : (row.reason as OrderCancelReason)
                      ),
                      row.count,
                      row.lost_value.toFixed(2)
                    ])
                  )
                }
              />
            </div>
            {loading ? (
              <ChartSkeleton heightClass="h-56" />
            ) : (
              <CancellationsReasonChart data={report.cancellations_by_reason} />
            )}
          </div>
        </div>
      </section>

      {/* ─── CHART 6: BUSIEST TIMES HEATMAP + DISCOUNT CODES ── */}
      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.95fr)]">
        <div className="min-w-0 border border-border bg-paper p-4 sm:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
              Demand rhythm
            </p>
            <h3 className="mt-1 font-serif text-2xl text-text">
              Busiest times (Day × Hour EAT)
            </h3>
          </div>
          {loading ? (
            <ChartSkeleton heightClass="h-60" />
          ) : (
            <BusiestTimesHeatmap cells={report.busiest_times_heatmap} />
          )}
        </div>

        <div className="min-w-0 border border-border bg-paper p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Promotions impact
              </p>
              <h3 className="mt-1 font-serif text-2xl text-text">
                Revenue by discount code
              </h3>
            </div>
            <CsvExportButton
              disabled={kpis.discounts_by_code.length === 0}
              onClick={() =>
                downloadCsvFile(
                  `auro-ardon-discount-codes-${dateTag}.csv`,
                  ["Code", "Uses", "Discount Given (KES)", "Order Revenue (KES)"],
                  kpis.discounts_by_code.map(row => [
                    row.code,
                    row.uses,
                    row.discount_total.toFixed(2),
                    row.revenue_total.toFixed(2)
                  ])
                )
              }
            />
          </div>
          {kpis.discounts_by_code.length === 0 ? (
            <p className="border border-dashed border-border bg-stone/40 p-6 text-center text-sm text-muted">
              No discount codes redeemed in this date range.
            </p>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="min-w-[360px] w-full divide-y divide-border text-left text-xs">
                <thead className="bg-stone uppercase tracking-[0.1em] text-muted">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2 text-right">Uses</th>
                    <th className="px-3 py-2 text-right">Discount</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {kpis.discounts_by_code.map(row => (
                    <tr key={row.code}>
                      <td className="px-3 py-2 font-mono font-semibold text-text">
                        {row.code}
                      </td>
                      <td className="px-3 py-2 text-right text-muted">{row.uses}</td>
                      <td className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-300">
                        -{formatCurrency(row.discount_total)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-text">
                        {formatCurrency(row.revenue_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ─── INVENTORY TRACKERS ─────────────────────────────── */}
      <section className="space-y-5 border border-border bg-paper p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
              Inventory intelligence
            </p>
            <h3 className="mt-1 font-serif text-3xl text-text">Inventory trackers</h3>
            <p className="mt-1 text-xs text-muted">
              Default low-stock threshold: {inventory.default_low_stock_threshold} units (per-product override supported).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <div className="border border-border bg-stone/50 px-3.5 py-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
                Stock retail value
              </p>
              <p className="font-serif text-xl text-text">
                {formatCurrency(inventory.stock_value.retail_value)}
              </p>
              <p className="text-[11px] text-muted">
                {inventory.stock_value.total_units} units ·{" "}
                {inventory.stock_value.active_products} active
              </p>
            </div>
            {report.include_owner_metrics ? (
              <div className="border border-brass/40 bg-stone/50 px-3.5 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-brass">
                  Stock cost value (Owner)
                </p>
                <p className="font-serif text-xl text-text">
                  {formatCurrency(inventory.stock_value.cost_value ?? 0)}
                </p>
                <p className="text-[11px] text-muted">
                  {(inventory.stock_value.products_missing_cost ?? 0) > 0
                    ? `${inventory.stock_value.products_missing_cost} product(s) missing cost`
                    : "All active SKUs costed"}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Inventory sub-tabs + CSV Export */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex gap-1.5 overflow-x-auto" role="tablist">
            {(
              [
                {
                  id: "out_of_stock",
                  label: `Out of stock (${inventory.out_of_stock.length})`
                },
                { id: "low_stock", label: `Low stock (${inventory.low_stock.length})` },
                {
                  id: "at_risk",
                  label: `Best sellers <7d (${inventory.best_sellers_at_risk.length})`
                },
                {
                  id: "dead_stock",
                  label: `Dead stock 30d (${inventory.dead_stock.length})`
                },
                {
                  id: "sell_through",
                  label: `Sell-through (${inventory.sell_through.length})`
                }
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={inventoryTab === tab.id}
                onClick={() => setInventoryTab(tab.id)}
                className={`min-h-9 shrink-0 rounded-[2px] border px-3 text-xs font-medium transition ${
                  inventoryTab === tab.id
                    ? "border-brass bg-brass text-ink"
                    : "border-border bg-paper text-muted hover:text-text"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <CsvExportButton
            onClick={() => {
              if (inventoryTab === "out_of_stock") {
                downloadCsvFile(
                  `auro-ardon-out-of-stock-${dateTag}.csv`,
                  ["Product", "Category", "Stock", "Threshold", "Price (KES)", "Units 30d"],
                  inventory.out_of_stock.map(i => [
                    i.title,
                    i.category,
                    i.stock_quantity,
                    i.threshold,
                    i.price,
                    i.units_30d
                  ])
                );
              } else if (inventoryTab === "low_stock") {
                downloadCsvFile(
                  `auro-ardon-low-stock-${dateTag}.csv`,
                  ["Product", "Category", "Stock", "Threshold", "Price (KES)", "Units 30d"],
                  inventory.low_stock.map(i => [
                    i.title,
                    i.category,
                    i.stock_quantity,
                    i.threshold,
                    i.price,
                    i.units_30d
                  ])
                );
              } else if (inventoryTab === "at_risk") {
                downloadCsvFile(
                  `auro-ardon-best-sellers-at-risk-${dateTag}.csv`,
                  [
                    "Product",
                    "Category",
                    "Stock",
                    "Units 30d",
                    "Daily Rate",
                    "Days of Stock"
                  ],
                  inventory.best_sellers_at_risk.map(i => [
                    i.title,
                    i.category,
                    i.stock_quantity,
                    i.units_30d,
                    i.daily_rate,
                    i.days_of_stock
                  ])
                );
              } else if (inventoryTab === "dead_stock") {
                downloadCsvFile(
                  `auro-ardon-dead-stock-${dateTag}.csv`,
                  report.include_owner_metrics
                    ? [
                        "Product",
                        "Category",
                        "Stock",
                        "Retail Value (KES)",
                        "Cost Value (KES)",
                        "Last Sale"
                      ]
                    : ["Product", "Category", "Stock", "Retail Value (KES)", "Last Sale"],
                  inventory.dead_stock.map(i =>
                    report.include_owner_metrics
                      ? [
                          i.title,
                          i.category,
                          i.stock_quantity,
                          i.retail_value.toFixed(2),
                          i.cost_value !== null ? i.cost_value.toFixed(2) : "",
                          i.last_sale_at ?? "Never"
                        ]
                      : [
                          i.title,
                          i.category,
                          i.stock_quantity,
                          i.retail_value.toFixed(2),
                          i.last_sale_at ?? "Never"
                        ]
                  )
                );
              } else {
                downloadCsvFile(
                  `auro-ardon-sell-through-${dateTag}.csv`,
                  [
                    "Product",
                    "Category",
                    "Units Sold",
                    "Current Stock",
                    "Sell-Through %",
                    "Revenue (KES)"
                  ],
                  inventory.sell_through.map(i => [
                    i.title,
                    i.category,
                    i.units_sold,
                    i.current_stock,
                    `${i.sell_through_pct}%`,
                    i.revenue.toFixed(2)
                  ])
                );
              }
            }}
          />
        </div>

        {/* Out of stock / Low stock tables */}
        {inventoryTab === "out_of_stock" || inventoryTab === "low_stock" ? (
          (() => {
            const rows =
              inventoryTab === "out_of_stock"
                ? inventory.out_of_stock
                : inventory.low_stock;
            if (!rows.length) {
              return (
                <p className="border border-dashed border-border bg-stone/40 p-6 text-center text-sm text-muted">
                  {inventoryTab === "out_of_stock"
                    ? "Zero active products are out of stock."
                    : "All active products are comfortably above their low-stock threshold."}
                </p>
              );
            }
            return (
              <div className="overflow-x-auto border border-border">
                <table className="min-w-[600px] w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5 text-right">Stock</th>
                      <th className="px-4 py-2.5 text-right">Threshold</th>
                      <th className="px-4 py-2.5 text-right">Sold (30d)</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map(item => (
                      <tr key={item.id} className="hover:bg-stone/40">
                        <td className="px-4 py-3 font-medium text-text">
                          <Link
                            href={`/admin/products/${item.id}/edit`}
                            className="hover:text-brass hover:underline"
                          >
                            {item.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted">{item.category}</td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            item.stock_quantity <= 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {item.stock_quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-muted">
                          {item.threshold}
                        </td>
                        <td className="px-4 py-3 text-right text-muted">
                          {item.units_30d}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustTarget({
                                id: item.id,
                                title: item.title,
                                stock_quantity: item.stock_quantity
                              });
                              setAdjustChange("5");
                              setAdjustNote("Restock delivery");
                            }}
                            className="text-xs font-semibold text-brass underline underline-offset-4 hover:opacity-80"
                          >
                            Adjust stock
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : null}

        {/* Best sellers at risk (<7 days stock) */}
        {inventoryTab === "at_risk" ? (
          inventory.best_sellers_at_risk.length === 0 ? (
            <p className="border border-dashed border-border bg-stone/40 p-6 text-center text-sm text-muted">
              No best sellers have fewer than 7 days of stock remaining at their 30-day sales rate.
            </p>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="min-w-[620px] w-full divide-y divide-border text-left text-sm">
                <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5 text-right">Stock left</th>
                    <th className="px-4 py-2.5 text-right">Sold (30d)</th>
                    <th className="px-4 py-2.5 text-right">Daily rate</th>
                    <th className="px-4 py-2.5 text-right">Days of stock</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inventory.best_sellers_at_risk.map(item => (
                    <tr key={item.id} className="hover:bg-stone/40">
                      <td className="px-4 py-3 font-medium text-text">{item.title}</td>
                      <td className="px-4 py-3 text-right font-semibold text-text">
                        {item.stock_quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {item.units_30d}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {item.daily_rate}/day
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">
                        {item.days_of_stock}d
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustTarget({
                              id: item.id,
                              title: item.title,
                              stock_quantity: item.stock_quantity
                            });
                            setAdjustChange("10");
                            setAdjustNote("Restock best seller");
                          }}
                          className="text-xs font-semibold text-brass underline underline-offset-4 hover:opacity-80"
                        >
                          Adjust stock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {/* Dead stock (0 sales in 30d) */}
        {inventoryTab === "dead_stock" ? (
          inventory.dead_stock.length === 0 ? (
            <p className="border border-dashed border-border bg-stone/40 p-6 text-center text-sm text-muted">
              Every stocked active product has recorded sales within the last 30 days.
            </p>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="min-w-[600px] w-full divide-y divide-border text-left text-sm">
                <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5 text-right">Units tied up</th>
                    <th className="px-4 py-2.5 text-right">Retail value</th>
                    {report.include_owner_metrics ? (
                      <th className="px-4 py-2.5 text-right">Cost value</th>
                    ) : null}
                    <th className="px-4 py-2.5">Last sale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inventory.dead_stock.map(item => (
                    <tr key={item.id} className="hover:bg-stone/40">
                      <td className="px-4 py-3 font-medium text-text">
                        <Link
                          href={`/admin/products/${item.id}/edit`}
                          className="hover:text-brass hover:underline"
                        >
                          {item.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{item.category}</td>
                      <td className="px-4 py-3 text-right text-text">
                        {item.stock_quantity}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-text">
                        {formatCurrency(item.retail_value)}
                      </td>
                      {report.include_owner_metrics ? (
                        <td className="px-4 py-3 text-right text-muted">
                          {item.cost_value !== null
                            ? formatCurrency(item.cost_value)
                            : "—"}
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-xs text-muted">
                        {item.last_sale_at ? formatNairobiDate(item.last_sale_at) : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {/* Sell-through rate per product */}
        {inventoryTab === "sell_through" ? (
          inventory.sell_through.length === 0 ? (
            <p className="border border-dashed border-border bg-stone/40 p-6 text-center text-sm text-muted">
              No active products available for sell-through calculation.
            </p>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="min-w-[600px] w-full divide-y divide-border text-left text-sm">
                <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5 text-right">Sold</th>
                    <th className="px-4 py-2.5 text-right">Stock left</th>
                    <th className="px-4 py-2.5 text-right">Sell-through</th>
                    <th className="px-4 py-2.5 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inventory.sell_through.map(item => (
                    <tr key={item.id} className="hover:bg-stone/40">
                      <td className="px-4 py-3 font-medium text-text">{item.title}</td>
                      <td className="px-4 py-3 text-muted">{item.category}</td>
                      <td className="px-4 py-3 text-right text-text">
                        {item.units_sold}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {item.current_stock}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-brass">
                        {item.sell_through_pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-text">
                        {formatCurrency(item.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>

      {/* ─── RECENT ORDERS + QUICK ACTIONS ──────────────────── */}
      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <div className="min-w-0 border border-border bg-paper p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Latest activity
              </p>
              <h3 className="mt-1 font-serif text-2xl text-text">Recent orders</h3>
            </div>
            <Link
              href="/admin/orders"
              className="text-sm font-semibold text-brass hover:underline"
            >
              View all
            </Link>
          </div>
          {report.recent_orders.length === 0 ? (
            <p className="border border-dashed border-border bg-stone/40 p-6 text-center text-sm text-muted">
              No customer orders yet.
            </p>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="min-w-[540px] w-full divide-y divide-border text-left text-sm">
                <thead className="bg-stone text-xs uppercase tracking-[0.1em] text-muted">
                  <tr>
                    <th className="px-3 py-2.5">Order</th>
                    <th className="px-3 py-2.5">Customer</th>
                    <th className="px-3 py-2.5">Zone</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.recent_orders.map(order => (
                    <tr key={order.id} className="hover:bg-stone/40">
                      <td className="px-3 py-2.5 font-semibold text-text">
                        <Link
                          href={`/admin/orders?order=${order.id}`}
                          className="hover:text-brass hover:underline"
                        >
                          {order.order_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-text">{order.customer_name}</td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {order.delivery_zone_name}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-text">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <OrderStatusBadge status={order.status} />
                          <PaymentStatusBadge status={order.payment_status} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="min-w-0 border border-border bg-paper p-4 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
            Shortcuts
          </p>
          <h3 className="mt-1 font-serif text-2xl text-text">Quick actions</h3>
          <div className="mt-4 grid gap-2">
            {[
              { href: "/admin/products/new", label: "Add product", Icon: Plus },
              { href: "/admin/orders", label: "Fulfillment queue", Icon: ClipboardList },
              { href: "/admin/riders?tab=dispatch", label: "Daily dispatch sheet", Icon: TrendingUp },
              { href: "/admin/invoices", label: "Invoices & daily cash-up", Icon: Clock },
              { href: "/admin/categories", label: "Manage categories", Icon: FolderTree },
              { href: "/admin/products", label: "Inventory & CSV import", Icon: Package },
              { href: "/", label: "View storefront", Icon: Store }
            ].map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-11 items-center gap-2.5 border border-border px-3 text-sm font-medium text-text transition hover:border-brass hover:bg-stone"
              >
                <Icon className="h-4 w-4 text-brass" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Adjust Stock Modal */}
      {adjustTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-adjust-stock-title"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close stock adjustment modal"
            className="absolute inset-0 bg-ink/60 backdrop-blur-[1px]"
            onClick={() => setAdjustTarget(null)}
          />
          <form
            onSubmit={handleSubmitQuickStockAdjust}
            className="relative z-10 w-full max-w-md space-y-4 border border-border bg-paper p-5 text-text shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                  Stock ledger adjustment
                </p>
                <h3
                  id="quick-adjust-stock-title"
                  className="mt-1 font-serif text-2xl text-text"
                >
                  {adjustTarget.title}
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Current stock: {adjustTarget.stock_quantity} unit(s)
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setAdjustTarget(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] text-muted hover:bg-stone hover:text-text"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-text">
                Change quantity (e.g. +5 or -1) <span className="text-brass">*</span>
              </span>
              <Input
                type="number"
                step="1"
                required
                value={adjustChange}
                onChange={event => setAdjustChange(event.target.value)}
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-text">
                Ledger note <span className="text-brass">*</span>
              </span>
              <Input
                type="text"
                required
                placeholder="e.g. New Nairobi stock shipment"
                value={adjustNote}
                onChange={event => setAdjustNote(event.target.value)}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAdjustTarget(null)}
                disabled={savingStock}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingStock}>
                {savingStock ? "Saving..." : "Record adjustment"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
