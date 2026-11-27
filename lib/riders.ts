import {
  formatOrderDisplayNumber,
  resolveCanonicalOrderStatus
} from "@/lib/admin-orders";
import {
  computeInvoiceBalanceDue,
  toMoneyNumber,
  toNairobiDateIso
} from "@/lib/invoices";
import { DEFAULT_MESSAGE_TEMPLATES, SITE_URL } from "@/lib/site";
import type {
  DeliveryMarginOrderRow,
  DeliveryMarginReport,
  DeliveryMarginRiderRow,
  DeliveryMarginZoneRow,
  DispatchSheetItemSummary,
  DispatchSheetReport,
  DispatchSheetRiderGroup,
  DispatchSheetRow,
  Invoice,
  Order,
  OrderItem,
  Rider
} from "@/lib/types";
import {
  createWhatsAppLink,
  normalizeKenyanPhoneNumber,
  normalizeWhatsAppNumber
} from "@/lib/utils";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Resolves the effective rider delivery cost (KES) for a given delivery zone.
 * Prefers an explicit per-zone override when present and non-negative, otherwise falls back to default_cost.
 */
export function resolveRiderCostForZone(
  rider: Pick<Rider, "default_cost" | "zone_costs">,
  deliveryZoneId?: string | null
): number {
  if (
    deliveryZoneId &&
    rider.zone_costs &&
    typeof rider.zone_costs === "object" &&
    Object.prototype.hasOwnProperty.call(rider.zone_costs, deliveryZoneId)
  ) {
    const raw = Number(rider.zone_costs[deliveryZoneId]);
    if (Number.isFinite(raw) && raw >= 0) {
      return round2(raw);
    }
  }
  const fallback = Number(rider.default_cost ?? 0);
  return Number.isFinite(fallback) && fallback >= 0 ? round2(fallback) : 0;
}

/**
 * Normalizes a zone_costs map to clean non-negative finite numbers keyed by delivery zone ID.
 */
export function sanitizeZoneCosts(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [zoneId, raw] of Object.entries(input as Record<string, unknown>)) {
    const key = zoneId.trim();
    if (!key) continue;
    if (raw === null || raw === undefined || raw === "") continue;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      result[key] = round2(parsed);
    }
  }
  return result;
}

/**
 * Formats a KES amount cleanly for WhatsApp template interpolation (e.g. "2,700" or "2,700.50").
 */
function formatTemplateAmount(value: number | string): string {
  const numeric = toMoneyNumber(value);
  const isWhole = Math.abs(numeric - Math.round(numeric)) < 0.005;
  return numeric.toLocaleString("en-KE", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2
  });
}

/**
 * Renders the "dispatched" WhatsApp message template with order & assigned rider details.
 */
export function interpolateDispatchedTemplate(params: {
  template?: string | null;
  customerName: string;
  orderNumber: string;
  riderName?: string | null;
  riderPhone?: string | null;
  total: number | string;
  trackLink: string;
}): string {
  const baseTemplate = params.template?.trim() || DEFAULT_MESSAGE_TEMPLATES.dispatched;
  const riderName = params.riderName?.trim() || "our delivery rider";
  const riderPhone = params.riderPhone?.trim() || "";
  const formattedTotal = formatTemplateAmount(params.total);

  let rendered = baseTemplate
    .replace(/\{\{?\s*name\s*\}?\}/gi, params.customerName.trim() || "there")
    .replace(/\{\{?\s*order\s*\}?\}/gi, params.orderNumber)
    .replace(/\{\{?\s*rider\s*\}?\}/gi, riderName)
    .replace(/\{\{?\s*rider_phone\s*\}?\}/gi, riderPhone)
    .replace(/\{\{?\s*total\s*\}?\}/gi, formattedTotal)
    .replace(/\{\{?\s*track_link\s*\}?\}/gi, params.trackLink);

  // Clean up empty parentheses if no rider phone was set (e.g. "with our delivery rider ()")
  if (!riderPhone) {
    rendered = rendered.replace(/\s*\(\s*\)/g, "");
  }

  return rendered.replace(/\s{2,}/g, " ").trim();
}

/**
 * Builds the one-click WhatsApp link for notifying a customer that their order was dispatched
 * with the assigned rider's name and phone filled into the store's `dispatched` template.
 */
export function buildDispatchedWhatsAppUrl(params: {
  order: Pick<
    Order,
    | "id"
    | "order_number"
    | "customer_name"
    | "customer_phone"
    | "total"
    | "rider_name"
    | "rider_phone"
  >;
  template?: string | null;
  trackLink?: string | null;
  amountToCollect?: number | null;
}): string | null {
  let phone: string | null = null;
  try {
    phone = normalizeKenyanPhoneNumber(params.order.customer_phone);
  } catch {
    phone = normalizeWhatsAppNumber(params.order.customer_phone);
  }
  if (!phone) return null;

  const orderNumber = formatOrderDisplayNumber(params.order);
  const trackLink = params.trackLink?.trim() || `${SITE_URL}/track`;
  const payableAmount =
    params.amountToCollect !== undefined && params.amountToCollect !== null
      ? Math.max(0, round2(params.amountToCollect))
      : toMoneyNumber(params.order.total);

  const message = interpolateDispatchedTemplate({
    template: params.template,
    customerName: params.order.customer_name,
    orderNumber,
    riderName: params.order.rider_name,
    riderPhone: params.order.rider_phone,
    total: payableAmount,
    trackLink
  });

  return createWhatsAppLink(phone, message);
}

/**
 * Computes the exact KES amount the rider must collect upon delivery.
 * Respects partial payments and credit notes on linked invoices.
 */
export function computeOrderAmountToCollect(
  order: Pick<Order, "total" | "payment_status" | "status" | "order_status">,
  invoice?: Pick<Invoice, "status" | "total" | "amount_paid" | "credited_amount"> | null
): number {
  if (resolveCanonicalOrderStatus(order) === "cancelled") {
    return 0;
  }

  if (invoice) {
    if (invoice.status === "void" || invoice.status === "paid") {
      return 0;
    }
    return computeInvoiceBalanceDue(invoice);
  }

  if (order.payment_status === "PAID") {
    return 0;
  }

  return Math.max(0, round2(toMoneyNumber(order.total)));
}

/**
 * Builds the printable daily dispatch sheet for a given EAT date (`YYYY-MM-DD`).
 */
export function buildDispatchSheetReport(
  dateIso: string,
  orders: Order[],
  items: OrderItem[],
  invoices: Invoice[],
  options?: {
    riderId?: string | null;
    includeConfirmed?: boolean;
  }
): DispatchSheetReport {
  const includeConfirmed = options?.includeConfirmed ?? false;
  const riderFilter = options?.riderId?.trim() || null;

  const itemsByOrderId = new Map<string, DispatchSheetItemSummary[]>();
  for (const item of items) {
    const list = itemsByOrderId.get(item.order_id) ?? [];
    list.push({
      title: item.product_title,
      variant_name: item.variant_name ?? null,
      quantity: Number(item.quantity ?? 0)
    });
    itemsByOrderId.set(item.order_id, list);
  }

  const invoiceByOrderId = new Map<string, Invoice>();
  for (const inv of invoices) {
    invoiceByOrderId.set(inv.order_id, inv);
  }

  const rows: DispatchSheetRow[] = [];

  for (const order of orders) {
    if (order.is_test) continue;
    const canonical = resolveCanonicalOrderStatus(order);
    if (canonical === "cancelled" || canonical === "pending") {
      continue;
    }

    const dispatchedDay = order.dispatched_at
      ? toNairobiDateIso(order.dispatched_at)
      : "";
    const createdDay = toNairobiDateIso(order.created_at);

    let matchesDate = false;
    if (dispatchedDay) {
      matchesDate = dispatchedDay === dateIso;
    } else if (canonical === "dispatched") {
      matchesDate = createdDay === dateIso;
    } else if (canonical === "confirmed" && includeConfirmed) {
      matchesDate = createdDay === dateIso;
    }

    if (!matchesDate) continue;

    if (riderFilter) {
      if (riderFilter === "unassigned") {
        if (order.rider_id) continue;
      } else if (order.rider_id !== riderFilter) {
        continue;
      }
    }

    const orderItems = itemsByOrderId.get(order.id) ?? [];
    const totalUnits = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    const itemsSummary =
      orderItems.length > 0
        ? orderItems
            .map(item =>
              item.variant_name
                ? `${item.quantity} × ${item.title} (${item.variant_name})`
                : `${item.quantity} × ${item.title}`
            )
            .join(", ")
        : "—";

    const invoice = invoiceByOrderId.get(order.id) ?? null;
    const amountToCollect = computeOrderAmountToCollect(order, invoice);
    const riderCost =
      order.rider_cost !== null && order.rider_cost !== undefined && order.rider_cost !== ""
        ? round2(toMoneyNumber(order.rider_cost))
        : null;

    rows.push({
      orderId: order.id,
      orderNumber: formatOrderDisplayNumber(order),
      status: canonical,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      deliveryZoneName: order.delivery_zone_name || order.customer_location || "Nairobi",
      address: order.delivery_address || order.customer_location || "—",
      townCounty: order.town_county ?? null,
      items: orderItems,
      itemsSummary,
      totalUnits,
      orderTotal: round2(toMoneyNumber(order.total)),
      amountToCollect,
      riderId: order.rider_id ?? null,
      riderName: order.rider_name?.trim() || "Unassigned",
      riderPhone: order.rider_phone ?? null,
      riderCost,
      dispatchedAt: order.dispatched_at ?? null,
      notes: order.notes ?? null,
      isGift: Boolean(order.is_gift),
      hidePrices: Boolean(order.hide_prices)
    });
  }

  // Sort by rider name (Unassigned last), then zone, then order number
  rows.sort((a, b) => {
    const aUnassigned = !a.riderId && a.riderName === "Unassigned";
    const bUnassigned = !b.riderId && b.riderName === "Unassigned";
    if (aUnassigned !== bUnassigned) return aUnassigned ? 1 : -1;
    const riderCmp = a.riderName.localeCompare(b.riderName);
    if (riderCmp !== 0) return riderCmp;
    const zoneCmp = a.deliveryZoneName.localeCompare(b.deliveryZoneName);
    if (zoneCmp !== 0) return zoneCmp;
    return a.orderNumber.localeCompare(b.orderNumber);
  });

  const groupMap = new Map<string, DispatchSheetRiderGroup>();
  for (const row of rows) {
    const riderKey = row.riderId ?? `name:${row.riderName.toLowerCase()}`;
    const existing = groupMap.get(riderKey) ?? {
      riderKey,
      riderId: row.riderId,
      riderName: row.riderName,
      riderPhone: row.riderPhone,
      orderCount: 0,
      totalToCollect: 0,
      totalRiderCost: 0,
      rows: []
    };
    existing.orderCount += 1;
    existing.totalToCollect = round2(existing.totalToCollect + row.amountToCollect);
    existing.totalRiderCost = round2(existing.totalRiderCost + (row.riderCost ?? 0));
    existing.rows.push(row);
    groupMap.set(riderKey, existing);
  }

  const byRider = Array.from(groupMap.values()).sort((a, b) => {
    const aUnassigned = !a.riderId && a.riderName === "Unassigned";
    const bUnassigned = !b.riderId && b.riderName === "Unassigned";
    if (aUnassigned !== bUnassigned) return aUnassigned ? 1 : -1;
    return a.riderName.localeCompare(b.riderName);
  });

  const totalAmountToCollect = round2(
    rows.reduce((sum, row) => sum + row.amountToCollect, 0)
  );
  const totalRiderCost = round2(
    rows.reduce((sum, row) => sum + (row.riderCost ?? 0), 0)
  );

  return {
    date: dateIso,
    totalOrders: rows.length,
    totalAmountToCollect,
    totalRiderCost,
    rows,
    byRider
  };
}

/**
 * Builds the Delivery Margin report (delivery fees charged vs rider costs) over an EAT date range `[fromIso, toIso]`.
 * Only counts operational delivery orders (dispatched, delivered, returned, or orders with a recorded rider cost)
 * and always excludes cancelled orders.
 */
export function buildDeliveryMarginReport(
  fromIso: string,
  toIso: string,
  orders: Order[]
): DeliveryMarginReport {
  const zoneMap = new Map<string, DeliveryMarginZoneRow>();
  const riderMap = new Map<string, DeliveryMarginRiderRow>();
  const orderRows: DeliveryMarginOrderRow[] = [];

  let totalFeesCharged = 0;
  let totalRiderCosts = 0;
  let ordersWithRiderCost = 0;
  let ordersMissingRiderCost = 0;

  for (const order of orders) {
    if (order.is_test) continue;
    const canonical = resolveCanonicalOrderStatus(order);
    if (canonical === "cancelled") continue;

    const hasExplicitRiderCost =
      order.rider_cost !== null &&
      order.rider_cost !== undefined &&
      order.rider_cost !== "";

    const isDeliveryOrder =
      canonical === "dispatched" ||
      canonical === "delivered" ||
      canonical === "returned" ||
      hasExplicitRiderCost;

    if (!isDeliveryOrder) continue;

    const eventDay = toNairobiDateIso(order.dispatched_at ?? order.created_at);
    if (!eventDay) continue;
    if (fromIso && eventDay < fromIso) continue;
    if (toIso && eventDay > toIso) continue;

    const feeCharged = round2(toMoneyNumber(order.shipping_fee));
    const riderCost = hasExplicitRiderCost
      ? round2(toMoneyNumber(order.rider_cost))
      : 0;
    const margin = round2(feeCharged - riderCost);

    if (hasExplicitRiderCost) {
      ordersWithRiderCost += 1;
    } else {
      ordersMissingRiderCost += 1;
    }

    totalFeesCharged = round2(totalFeesCharged + feeCharged);
    totalRiderCosts = round2(totalRiderCosts + riderCost);

    const zoneName =
      order.delivery_zone_name?.trim() ||
      order.customer_location?.trim() ||
      "Unspecified";
    const zoneEntry = zoneMap.get(zoneName) ?? {
      zoneName,
      orderCount: 0,
      feesCharged: 0,
      riderCosts: 0,
      margin: 0,
      marginPercent: null
    };
    zoneEntry.orderCount += 1;
    zoneEntry.feesCharged = round2(zoneEntry.feesCharged + feeCharged);
    zoneEntry.riderCosts = round2(zoneEntry.riderCosts + riderCost);
    zoneEntry.margin = round2(zoneEntry.feesCharged - zoneEntry.riderCosts);
    zoneEntry.marginPercent =
      zoneEntry.feesCharged > 0
        ? round1((zoneEntry.margin / zoneEntry.feesCharged) * 100)
        : null;
    zoneMap.set(zoneName, zoneEntry);

    const riderName = order.rider_name?.trim() || "Unassigned / Self-delivery";
    const riderKey = order.rider_id ?? `name:${riderName.toLowerCase()}`;
    const riderEntry = riderMap.get(riderKey) ?? {
      riderId: order.rider_id ?? null,
      riderName,
      riderPhone: order.rider_phone ?? null,
      orderCount: 0,
      feesCharged: 0,
      riderCosts: 0,
      margin: 0,
      marginPercent: null
    };
    riderEntry.orderCount += 1;
    riderEntry.feesCharged = round2(riderEntry.feesCharged + feeCharged);
    riderEntry.riderCosts = round2(riderEntry.riderCosts + riderCost);
    riderEntry.margin = round2(riderEntry.feesCharged - riderEntry.riderCosts);
    riderEntry.marginPercent =
      riderEntry.feesCharged > 0
        ? round1((riderEntry.margin / riderEntry.feesCharged) * 100)
        : null;
    riderMap.set(riderKey, riderEntry);

    orderRows.push({
      orderId: order.id,
      orderNumber: formatOrderDisplayNumber(order),
      createdAt: order.created_at,
      dispatchedAt: order.dispatched_at ?? null,
      status: canonical,
      customerName: order.customer_name,
      zoneName,
      riderName,
      deliveryFeeCharged: feeCharged,
      riderCost,
      margin
    });
  }

  const netMargin = round2(totalFeesCharged - totalRiderCosts);
  const marginPercent =
    totalFeesCharged > 0 ? round1((netMargin / totalFeesCharged) * 100) : null;

  orderRows.sort((a, b) =>
    (b.dispatchedAt ?? b.createdAt).localeCompare(a.dispatchedAt ?? a.createdAt)
  );

  return {
    from: fromIso,
    to: toIso,
    orderCount: orderRows.length,
    ordersWithRiderCost,
    ordersMissingRiderCost,
    totalFeesCharged,
    totalRiderCosts,
    netMargin,
    marginPercent,
    byZone: Array.from(zoneMap.values()).sort(
      (a, b) => b.orderCount - a.orderCount || a.zoneName.localeCompare(b.zoneName)
    ),
    byRider: Array.from(riderMap.values()).sort(
      (a, b) => b.orderCount - a.orderCount || a.riderName.localeCompare(b.riderName)
    ),
    orders: orderRows
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildDeliveryMarginCsv(report: DeliveryMarginReport): string {
  const lines: Array<Array<string | number>> = [
    ["Auro Ardon Delivery Margin Report", `${report.from} to ${report.to}`],
    ["Metric", "Amount (KES)"],
    ["Dispatched / delivered orders", report.orderCount],
    ["Delivery fees charged", report.totalFeesCharged.toFixed(2)],
    ["Rider costs paid", report.totalRiderCosts.toFixed(2)],
    ["Net delivery margin", report.netMargin.toFixed(2)],
    [
      "Delivery margin %",
      report.marginPercent !== null ? `${report.marginPercent.toFixed(1)}%` : "N/A"
    ],
    [],
    ["Zone Breakdown"],
    ["Zone", "Orders", "Fees Charged (KES)", "Rider Costs (KES)", "Margin (KES)", "Margin %"],
    ...report.byZone.map(row => [
      row.zoneName,
      row.orderCount,
      row.feesCharged.toFixed(2),
      row.riderCosts.toFixed(2),
      row.margin.toFixed(2),
      row.marginPercent !== null ? `${row.marginPercent.toFixed(1)}%` : "N/A"
    ]),
    [],
    ["Rider Breakdown"],
    ["Rider", "Phone", "Orders", "Fees Charged (KES)", "Rider Costs (KES)", "Margin (KES)"],
    ...report.byRider.map(row => [
      row.riderName,
      row.riderPhone ?? "",
      row.orderCount,
      row.feesCharged.toFixed(2),
      row.riderCosts.toFixed(2),
      row.margin.toFixed(2)
    ]),
    [],
    ["Order Detail"],
    [
      "Order No.",
      "Date (EAT)",
      "Status",
      "Customer",
      "Zone",
      "Rider",
      "Delivery Fee (KES)",
      "Rider Cost (KES)",
      "Margin (KES)"
    ],
    ...report.orders.map(row => [
      row.orderNumber,
      toNairobiDateIso(row.dispatchedAt ?? row.createdAt),
      row.status,
      row.customerName,
      row.zoneName,
      row.riderName,
      row.deliveryFeeCharged.toFixed(2),
      row.riderCost.toFixed(2),
      row.margin.toFixed(2)
    ])
  ];

  return lines.map(row => row.map(escapeCsvCell).join(",")).join("\n");
}

