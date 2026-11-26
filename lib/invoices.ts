import { resolveCanonicalOrderStatus } from "@/lib/admin-orders";
import type {
  CreditNote,
  DailyCashupReport,
  Invoice,
  InvoicePayment,
  InvoiceStatus,
  MonthlySummaryReport,
  Order,
  RiderCashupSummary
} from "@/lib/types";
import {
  createWhatsAppLink,
  formatCurrency,
  normalizeKenyanPhoneNumber,
  normalizeWhatsAppNumber
} from "@/lib/utils";

export const NAIROBI_TIME_ZONE = "Africa/Nairobi";
export const MPESA_CODE_REGEX = /^[A-Z0-9]{10,12}$/;

export function normalizeMpesaCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidMpesaCode(value: string): boolean {
  return MPESA_CODE_REGEX.test(normalizeMpesaCode(value));
}

/**
 * Document title is strictly "Invoice" or "Receipt" — NEVER "Tax Invoice".
 */
export function getInvoiceDocumentTitle(
  invoice: Pick<Invoice, "status">
): "Invoice" | "Receipt" {
  return invoice.status === "paid" ? "Receipt" : "Invoice";
}

export function getInvoiceStatusLabel(status: InvoiceStatus): string {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "partially_paid":
      return "Partially paid";
    case "paid":
      return "Paid";
    case "void":
      return "Void";
  }
}

export function getInvoiceStatusBadgeClassName(status: InvoiceStatus): string {
  switch (status) {
    case "unpaid":
      return "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200";
    case "partially_paid":
      return "border-blue-300 bg-blue-100 text-blue-950 dark:border-blue-500/40 dark:bg-blue-950/60 dark:text-blue-200";
    case "paid":
      return "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200";
    case "void":
      return "border-red-300 bg-red-100 text-red-950 dark:border-red-500/40 dark:bg-red-950/60 dark:text-red-200";
  }
}

export function toMoneyNumber(value: string | number | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
}

export function computeInvoiceBalanceDue(
  invoice: Pick<Invoice, "total" | "credited_amount" | "amount_paid">
): number {
  const total = toMoneyNumber(invoice.total);
  const credited = toMoneyNumber(invoice.credited_amount);
  const paid = toMoneyNumber(invoice.amount_paid);
  return Math.max(0, Math.round((total - credited - paid) * 100) / 100);
}

export function isShareTokenActive(
  invoice: Pick<Invoice, "share_revoked" | "share_expires_at">,
  nowMs = Date.now()
): boolean {
  if (invoice.share_revoked) return false;
  const expiresMs = Date.parse(invoice.share_expires_at);
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs > nowMs;
}

export function buildInvoiceShareWhatsAppUrl(
  invoice: Invoice,
  shareUrl: string
): string | null {
  const rawPhone = invoice.customer_snapshot?.phone;
  if (!rawPhone) return null;

  let phone: string | null = null;
  try {
    phone = normalizeKenyanPhoneNumber(rawPhone);
  } catch {
    phone = normalizeWhatsAppNumber(rawPhone);
  }
  if (!phone) return null;

  const docTitle = getInvoiceDocumentTitle(invoice);
  const balanceDue = computeInvoiceBalanceDue(invoice);
  const customerName = invoice.customer_snapshot.full_name || "there";
  const siteName = invoice.business_snapshot.site_name || "Auro Ardon";

  const lines = [
    `Hi ${customerName}, here is your ${docTitle.toLowerCase()} ${invoice.invoice_number} from ${siteName}.`,
    invoice.status === "paid"
      ? `Total paid: ${formatCurrency(invoice.amount_paid)} (PAID).`
      : `Total: ${formatCurrency(invoice.total)} · Balance due: ${formatCurrency(balanceDue)}.`,
    `View / download PDF: ${shareUrl}`
  ];

  return createWhatsAppLink(phone, lines.join("\n"));
}

export function toNairobiDateIso(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NAIROBI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function toNairobiMonthIso(value: string | Date): string {
  return toNairobiDateIso(value).slice(0, 7);
}

/**
 * Daily Cash-Up Report for a chosen EAT date (`YYYY-MM-DD`).
 * Expected = net payable value of non-void invoices issued or dispatched on that date
 * (or invoices whose payments were collected on that date).
 * Collected = cash + M-Pesa payments recorded with `paid_at` on that EAT date.
 * Grouped by assigned rider (falling back to payment `received_by` when unassigned).
 */
export function buildDailyCashupReport(
  dateIso: string,
  orders: Order[],
  invoices: Invoice[],
  payments: InvoicePayment[]
): DailyCashupReport {
  const invoiceById = new Map(invoices.map(inv => [inv.id, inv]));
  const orderById = new Map(orders.map(order => [order.id, order]));

  // Payments collected on the selected EAT date
  const dayPayments = payments.filter(
    payment => toNairobiDateIso(payment.paid_at) === dateIso
  );

  const dayPaymentsByInvoice = new Map<string, InvoicePayment[]>();
  for (const payment of dayPayments) {
    const list = dayPaymentsByInvoice.get(payment.invoice_id) ?? [];
    list.push(payment);
    dayPaymentsByInvoice.set(payment.invoice_id, list);
  }

  // Expected: non-void invoices belonging to active orders issued or dispatched that date OR paid that date
  const expectedInvoiceIds = new Set<string>();
  for (const inv of invoices) {
    if (inv.status === "void") continue;
    const linkedOrder = orderById.get(inv.order_id);
    if (linkedOrder && resolveCanonicalOrderStatus(linkedOrder) === "cancelled") {
      continue;
    }
    const issuedDay = toNairobiDateIso(inv.issued_at);
    const dispatchedDay = linkedOrder?.dispatched_at
      ? toNairobiDateIso(linkedOrder.dispatched_at)
      : "";
    const hasPaymentToday = dayPaymentsByInvoice.has(inv.id);
    if (issuedDay === dateIso || dispatchedDay === dateIso || hasPaymentToday) {
      expectedInvoiceIds.add(inv.id);
    }
  }

  const riderMap = new Map<string, RiderCashupSummary>();
  const riderDisplayToKey = new Map<string, string>();

  function getOrCreateRiderRow(params: {
    riderId?: string | null;
    riderName?: string | null;
    riderPhone?: string | null;
    fallbackLabel: string;
  }): RiderCashupSummary {
    const label = params.riderName?.trim() || params.fallbackLabel.trim() || "Unassigned";
    const normalizedLabel = label.toLowerCase();
    const mapKey = params.riderId
      ? `id:${params.riderId}`
      : (riderDisplayToKey.get(normalizedLabel) ?? `name:${normalizedLabel}`);

    if (!riderDisplayToKey.has(normalizedLabel)) {
      riderDisplayToKey.set(normalizedLabel, mapKey);
    }

    const existing = riderMap.get(mapKey);
    if (existing) {
      if (params.riderId && !existing.riderId) existing.riderId = params.riderId;
      if (params.riderPhone && !existing.riderPhone) existing.riderPhone = params.riderPhone;
      return existing;
    }

    const created: RiderCashupSummary = {
      receivedBy: label,
      riderId: params.riderId ?? null,
      riderPhone: params.riderPhone ?? null,
      expectedTotal: 0,
      deliveryCount: 0,
      riderCostTotal: 0,
      cashTotal: 0,
      mpesaTotal: 0,
      totalCollected: 0,
      difference: 0,
      paymentCount: 0,
      mpesaCodes: []
    };
    riderMap.set(mapKey, created);
    return created;
  }

  let expectedTotal = 0;
  let totalRiderCost = 0;
  const countedRiderCostOrders = new Set<string>();

  for (const invoiceId of expectedInvoiceIds) {
    const inv = invoiceById.get(invoiceId);
    if (!inv) continue;
    const netExpected = Math.max(
      0,
      Math.round((toMoneyNumber(inv.total) - toMoneyNumber(inv.credited_amount)) * 100) / 100
    );
    expectedTotal = Math.round((expectedTotal + netExpected) * 100) / 100;

    const linkedOrder = orderById.get(inv.order_id);
    const invDayPayments = dayPaymentsByInvoice.get(inv.id) ?? [];
    const fallbackCollector =
      invDayPayments[0]?.received_by?.trim() || "Unassigned";

    const riderRow = getOrCreateRiderRow({
      riderId: linkedOrder?.rider_id ?? null,
      riderName: linkedOrder?.rider_name ?? null,
      riderPhone: linkedOrder?.rider_phone ?? null,
      fallbackLabel: fallbackCollector
    });

    riderRow.expectedTotal = Math.round((riderRow.expectedTotal + netExpected) * 100) / 100;
    riderRow.deliveryCount += 1;

    if (linkedOrder && !countedRiderCostOrders.has(linkedOrder.id)) {
      countedRiderCostOrders.add(linkedOrder.id);
      const cost = toMoneyNumber(linkedOrder.rider_cost ?? 0);
      if (cost > 0) {
        riderRow.riderCostTotal = Math.round((riderRow.riderCostTotal + cost) * 100) / 100;
        totalRiderCost = Math.round((totalRiderCost + cost) * 100) / 100;
      }
    }
  }

  let cashTotal = 0;
  let mpesaTotal = 0;
  const mpesaPayments: DailyCashupReport["mpesaPayments"] = [];

  for (const payment of dayPayments) {
    const amount = toMoneyNumber(payment.amount);
    const linkedOrder = orderById.get(payment.order_id);
    const collectorLabel = payment.received_by.trim() || "Unassigned";

    const rider = getOrCreateRiderRow({
      riderId: linkedOrder?.rider_id ?? null,
      riderName: linkedOrder?.rider_name ?? null,
      riderPhone: linkedOrder?.rider_phone ?? null,
      fallbackLabel: collectorLabel
    });

    rider.totalCollected = Math.round((rider.totalCollected + amount) * 100) / 100;
    rider.paymentCount += 1;

    if (payment.method === "mpesa") {
      mpesaTotal = Math.round((mpesaTotal + amount) * 100) / 100;
      rider.mpesaTotal = Math.round((rider.mpesaTotal + amount) * 100) / 100;
      if (payment.mpesa_code) {
        rider.mpesaCodes.push(payment.mpesa_code);
        mpesaPayments.push({
          paymentId: payment.id,
          invoiceNumber:
            invoiceById.get(payment.invoice_id)?.invoice_number ??
            payment.invoice_id.slice(0, 8).toUpperCase(),
          mpesaCode: payment.mpesa_code,
          amount,
          receivedBy: rider.receivedBy,
          paidAt: payment.paid_at
        });
      }
    } else {
      cashTotal = Math.round((cashTotal + amount) * 100) / 100;
      rider.cashTotal = Math.round((rider.cashTotal + amount) * 100) / 100;
    }
  }

  for (const row of riderMap.values()) {
    row.difference = Math.round((row.totalCollected - row.expectedTotal) * 100) / 100;
  }

  const collectedTotal = Math.round((cashTotal + mpesaTotal) * 100) / 100;
  expectedTotal = Math.round(expectedTotal * 100) / 100;
  const difference = Math.round((collectedTotal - expectedTotal) * 100) / 100;

  return {
    date: dateIso,
    expectedTotal,
    collectedTotal,
    difference,
    cashTotal,
    mpesaTotal,
    totalRiderCost,
    expectedInvoiceCount: expectedInvoiceIds.size,
    paymentCount: dayPayments.length,
    mpesaPayments,
    byRider: Array.from(riderMap.values()).sort(
      (a, b) =>
        b.expectedTotal - a.expectedTotal ||
        b.totalCollected - a.totalCollected ||
        a.receivedBy.localeCompare(b.receivedBy)
    )
  };
}

/**
 * Monthly Financial Summary for a chosen EAT month (`YYYY-MM`).
 */
export function buildMonthlySummaryReport(
  monthIso: string,
  invoices: Invoice[],
  payments: InvoicePayment[],
  creditNotes: CreditNote[]
): MonthlySummaryReport {
  const monthInvoices = invoices.filter(
    inv => toNairobiMonthIso(inv.issued_at) === monthIso
  );
  const monthCreditNotes = creditNotes.filter(
    cn => toNairobiMonthIso(cn.created_at) === monthIso
  );
  const monthPayments = payments.filter(
    payment => toNairobiMonthIso(payment.paid_at) === monthIso
  );

  const grossSales = Math.round(
    monthInvoices.reduce((sum, inv) => sum + toMoneyNumber(inv.subtotal), 0) * 100
  ) / 100;
  const discounts = Math.round(
    monthInvoices.reduce((sum, inv) => sum + toMoneyNumber(inv.discount_amount), 0) * 100
  ) / 100;
  const deliveryFees = Math.round(
    monthInvoices.reduce((sum, inv) => sum + toMoneyNumber(inv.delivery_fee), 0) * 100
  ) / 100;
  const creditNotesTotal = Math.round(
    monthCreditNotes.reduce((sum, cn) => sum + toMoneyNumber(cn.amount), 0) * 100
  ) / 100;
  const netSales = Math.max(
    0,
    Math.round((grossSales - discounts + deliveryFees - creditNotesTotal) * 100) / 100
  );

  let cashCollected = 0;
  let mpesaCollected = 0;
  for (const payment of monthPayments) {
    const amount = toMoneyNumber(payment.amount);
    if (payment.method === "mpesa") {
      mpesaCollected += amount;
    } else {
      cashCollected += amount;
    }
  }
  cashCollected = Math.round(cashCollected * 100) / 100;
  mpesaCollected = Math.round(mpesaCollected * 100) / 100;

  return {
    month: monthIso,
    invoiceCount: monthInvoices.length,
    creditNoteCount: monthCreditNotes.length,
    paymentCount: monthPayments.length,
    grossSales,
    discounts,
    deliveryFees,
    creditNotesTotal,
    netSales,
    cashCollected,
    mpesaCollected,
    totalCollected: Math.round((cashCollected + mpesaCollected) * 100) / 100
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildMonthlySummaryCsv(
  report: MonthlySummaryReport,
  invoices: Invoice[],
  payments: InvoicePayment[],
  creditNotes: CreditNote[]
): string {
  const rows: Array<Array<string | number>> = [
    ["Auro Ardon Monthly Financial Summary", report.month],
    ["Metric", "Amount (KES)"],
    ["Gross sales (items subtotal)", report.grossSales.toFixed(2)],
    ["Discounts", (-report.discounts).toFixed(2)],
    ["Delivery fees", report.deliveryFees.toFixed(2)],
    ["Credit notes", (-report.creditNotesTotal).toFixed(2)],
    ["Net sales", report.netSales.toFixed(2)],
    ["Payments — Cash", report.cashCollected.toFixed(2)],
    ["Payments — M-Pesa", report.mpesaCollected.toFixed(2)],
    ["Total payments collected", report.totalCollected.toFixed(2)],
    ["Invoices issued", report.invoiceCount],
    ["Credit notes issued", report.creditNoteCount],
    [],
    [
      "Invoice Number",
      "Issued Date (EAT)",
      "Status",
      "Customer",
      "Subtotal (KES)",
      "Discount (KES)",
      "Delivery (KES)",
      "Total (KES)",
      "Credited (KES)",
      "Paid (KES)",
      "eTIMS Ref"
    ]
  ];

  for (const inv of invoices.filter(i => toNairobiMonthIso(i.issued_at) === report.month)) {
    rows.push([
      inv.invoice_number,
      toNairobiDateIso(inv.issued_at),
      inv.status,
      inv.customer_snapshot.full_name,
      toMoneyNumber(inv.subtotal).toFixed(2),
      toMoneyNumber(inv.discount_amount).toFixed(2),
      toMoneyNumber(inv.delivery_fee).toFixed(2),
      toMoneyNumber(inv.total).toFixed(2),
      toMoneyNumber(inv.credited_amount).toFixed(2),
      toMoneyNumber(inv.amount_paid).toFixed(2),
      inv.etims_invoice_number ?? ""
    ]);
  }

  rows.push([]);
  rows.push([
    "Payment Date (EAT)",
    "Method",
    "M-Pesa Code",
    "Amount (KES)",
    "Received By",
    "Invoice ID",
    "Note"
  ]);
  for (const pay of payments.filter(p => toNairobiMonthIso(p.paid_at) === report.month)) {
    rows.push([
      toNairobiDateIso(pay.paid_at),
      pay.method.toUpperCase(),
      pay.mpesa_code ?? "",
      toMoneyNumber(pay.amount).toFixed(2),
      pay.received_by,
      pay.invoice_id,
      pay.note ?? ""
    ]);
  }

  rows.push([]);
  rows.push(["Credit Note Number", "Date (EAT)", "Invoice ID", "Amount (KES)", "Reason"]);
  for (const cn of creditNotes.filter(c => toNairobiMonthIso(c.created_at) === report.month)) {
    rows.push([
      cn.credit_note_number,
      toNairobiDateIso(cn.created_at),
      cn.invoice_id,
      toMoneyNumber(cn.amount).toFixed(2),
      cn.reason
    ]);
  }

  return rows.map(row => row.map(escapeCsvCell).join(",")).join("\n");
}

