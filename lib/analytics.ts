import { toNairobiDateIso } from "@/lib/invoices";
import type {
  AnalyticsDashboardReport,
  AnalyticsDatePreset,
  AnalyticsPeriodKpis
} from "@/lib/types";

function shiftIsoDate(dateIso: string, deltaDays: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function resolveAnalyticsDateRange(
  preset: AnalyticsDatePreset = "30d",
  customFrom?: string | null,
  customTo?: string | null,
  now: Date = new Date()
): { from: string; to: string; preset: AnalyticsDatePreset } {
  const today = toNairobiDateIso(now);

  switch (preset) {
    case "today":
      return { from: today, to: today, preset: "today" };
    case "7d":
      return { from: shiftIsoDate(today, -6), to: today, preset: "7d" };
    case "30d":
      return { from: shiftIsoDate(today, -29), to: today, preset: "30d" };
    case "90d":
      return { from: shiftIsoDate(today, -89), to: today, preset: "90d" };
    case "this_month":
      return { from: `${today.slice(0, 7)}-01`, to: today, preset: "this_month" };
    case "custom": {
      const isoRe = /^\d{4}-\d{2}-\d{2}$/;
      const from = customFrom && isoRe.test(customFrom) ? customFrom : shiftIsoDate(today, -29);
      const to = customTo && isoRe.test(customTo) ? customTo : today;
      return from <= to
        ? { from, to, preset: "custom" }
        : { from: to, to: from, preset: "custom" };
    }
    default:
      return { from: shiftIsoDate(today, -29), to: today, preset: "30d" };
  }
}

export interface KpiDelta {
  deltaPct: number | null;
  direction: "up" | "down" | "flat" | "na";
}

export function computePercentDelta(
  current: number | null | undefined,
  previous: number | null | undefined
): KpiDelta {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return { deltaPct: null, direction: "na" };
  }

  if (Math.abs(current - previous) < 0.0001) {
    return { deltaPct: 0, direction: "flat" };
  }

  if (Math.abs(previous) < 0.0001) {
    return {
      deltaPct: current > 0 ? 100 : -100,
      direction: current > 0 ? "up" : "down"
    };
  }

  const pct = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  return {
    deltaPct: pct,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat"
  };
}

export function formatHoursDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) {
    return "—";
  }
  if (hours < 1) {
    return `${Math.max(1, Math.round(hours * 60))}m`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours % 24);
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvContent(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>
): string {
  return [
    headers.map(escapeCsvCell).join(","),
    ...rows.map(row => row.map(escapeCsvCell).join(","))
  ].join("\n");
}

const BOT_UA_PATTERN =
  /bot|crawler|spider|slurp|mediapartners|facebookexternalhit|whatsapp|bingpreview|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|pagespeed|curl\/|wget\/|python-requests|go-http-client|axios\/|node-fetch|ahrefs|semrush|mj12bot|dotbot|yandex|baiduspider|duckduckbot|applebot|twitterbot|linkedinbot|discordbot|telegrambot|uptimerobot|pingdom|datadog/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || !userAgent.trim()) return true;
  return BOT_UA_PATTERN.test(userAgent);
}

export function buildEmptyPeriodKpis(includeOwnerMetrics: boolean): AnalyticsPeriodKpis {
  return {
    booked_revenue: 0,
    collected_revenue: 0,
    delivery_fees_collected: 0,
    delivery_rider_costs: 0,
    delivery_margin: 0,
    gross_profit: includeOwnerMetrics ? 0 : null,
    gross_margin_pct: null,
    items_missing_cost: includeOwnerMetrics ? 0 : null,
    orders_total: 0,
    orders_active: 0,
    orders_by_status: {
      pending: 0,
      confirmed: 0,
      dispatched: 0,
      delivered: 0,
      cancelled: 0,
      returned: 0
    },
    aov: 0,
    confirmation_rate: 0,
    cancellation_rate: 0,
    return_rate: 0,
    avg_hours_to_confirm: null,
    avg_hours_to_deliver: null,
    new_customers: 0,
    returning_customers: 0,
    discounts_given: 0,
    discounts_by_code: []
  };
}

export function buildEmptyAnalyticsDashboardReport(
  from: string,
  to: string,
  includeOwnerMetrics: boolean
): AnalyticsDashboardReport {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const days =
    Number.isFinite(fromMs) && Number.isFinite(toMs)
      ? Math.max(1, Math.round((toMs - fromMs) / 86_400_000) + 1)
      : 30;

  return {
    range: {
      from,
      to,
      previous_from: shiftIsoDate(from, -days),
      previous_to: shiftIsoDate(from, -1),
      days,
      granularity: days <= 31 ? "day" : "week"
    },
    include_owner_metrics: includeOwnerMetrics,
    kpis: buildEmptyPeriodKpis(includeOwnerMetrics),
    previous_kpis: buildEmptyPeriodKpis(includeOwnerMetrics),
    revenue_series: [],
    funnel: {
      product_views: 0,
      add_to_bag: 0,
      begin_checkout: 0,
      whatsapp_order_sent: 0,
      confirmed: 0,
      delivered: 0,
      whatsapp_questions: 0
    },
    top_products: [],
    sales_by_category: [],
    sales_by_zone: [],
    busiest_times_heatmap: [],
    cancellations_by_reason: [],
    status_breakdown: [],
    inventory: {
      default_low_stock_threshold: 3,
      stock_value: {
        total_units: 0,
        active_products: 0,
        retail_value: 0,
        cost_value: includeOwnerMetrics ? 0 : null,
        products_missing_cost: includeOwnerMetrics ? 0 : null
      },
      out_of_stock: [],
      low_stock: [],
      best_sellers_at_risk: [],
      dead_stock: [],
      sell_through: []
    },
    needs_attention: {
      pending_over_24h_count: 0,
      pending_over_24h: [],
      out_of_stock_best_sellers_count: 0,
      out_of_stock_best_sellers: [],
      dispatched_over_3d_count: 0,
      dispatched_over_3d: [],
      unpaid_delivered_invoices_count: 0,
      unpaid_delivered_invoices_total: 0,
      unpaid_delivered_invoices: [],
      reviews_pending_moderation_count: 0
    },
    recent_orders: []
  };
}

