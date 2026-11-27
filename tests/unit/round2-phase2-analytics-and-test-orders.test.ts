import { describe, expect, it } from "vitest";

import {
  computeAverageOrderValue,
  formatOrdersCardHeadline
} from "@/lib/analytics";
import {
  buildInternalTrafficCookieOptions,
  hasInternalCookieInHeader,
  INTERNAL_TRAFFIC_COOKIE,
  INTERNAL_TRAFFIC_COOKIE_MAX_AGE,
  isAdminPath,
  shouldDropTelemetryEvent
} from "@/lib/internal-traffic";
import {
  buildDailyCashupReport,
  buildMonthlySummaryReport,
  isTestInvoice
} from "@/lib/invoices";
import { buildDailySummaryReport } from "@/lib/notifications";
import { renderInvoicePdfBuffer } from "@/lib/pdf/invoice-pdf";
import { buildDeliveryMarginReport, buildDispatchSheetReport } from "@/lib/riders";
import { isTestOrderCustomerName } from "@/lib/test-orders";
import type { Invoice, InvoiceDetailBundle, InvoicePayment, Order } from "@/lib/types";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord-1",
    order_number: "AA-10001",
    channel: "whatsapp",
    status: "delivered",
    is_test: false,
    customer_id: "cust-1",
    customer_name: "Amina Wanjiku",
    customer_email: null,
    customer_phone: "254712345678",
    customer_location: "Westlands — Sarit",
    delivery_zone_id: "zone-1",
    delivery_zone_name: "Westlands",
    delivery_address: "Sarit Centre",
    town_county: null,
    notes: null,
    payment_method: "WHATSAPP",
    payment_status: "PAID",
    order_status: "DELIVERED",
    subtotal: "4000.00",
    shipping_fee: "200.00",
    total: "4200.00",
    rider_cost: "150.00",
    dispatched_at: "2026-11-27T08:00:00.000Z",
    created_at: "2026-11-27T07:00:00.000Z",
    ...overrides
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    invoice_number: "INV-2026-0001",
    order_id: "ord-1",
    is_test: false,
    status: "paid",
    issued_at: "2026-11-27T07:30:00.000Z",
    due_at: "2026-12-04T07:30:00.000Z",
    etims_invoice_number: null,
    share_token: "a".repeat(48),
    share_expires_at: "2027-02-27T07:30:00.000Z",
    share_revoked: false,
    customer_snapshot: {
      full_name: "Amina Wanjiku",
      phone: "254712345678",
      address: "Sarit Centre",
      delivery_zone_name: "Westlands",
      order_number: "AA-10001"
    },
    lines_snapshot: [
      {
        name: "Classic Watch",
        sku: "AA-WATCH-001",
        qty: 1,
        unit_price: 4000,
        line_total: 4000
      }
    ],
    business_snapshot: {
      site_name: "Auro Ardon",
      business_phone: "254718038825",
      business_address: "Nairobi, Kenya"
    },
    subtotal: "4000.00",
    discount_code: null,
    discount_amount: "0.00",
    delivery_fee: "200.00",
    total: "4200.00",
    amount_paid: "4200.00",
    credited_amount: "0.00",
    pdf_a4_path: null,
    pdf_receipt_path: null,
    created_by: "owner",
    created_at: "2026-11-27T07:30:00.000Z",
    updated_at: "2026-11-27T07:30:00.000Z",
    ...overrides
  };
}

describe("Round 2 Phase 2 — Internal traffic exclusion & Vercel beforeSend guard", () => {
  it("builds a 1-year client-readable internal cookie and detects aa_internal=1", () => {
    const opts = buildInternalTrafficCookieOptions(true);
    expect(opts.httpOnly).toBe(false);
    expect(opts.maxAge).toBe(INTERNAL_TRAFFIC_COOKIE_MAX_AGE);
    expect(opts.path).toBe("/");

    expect(hasInternalCookieInHeader(`${INTERNAL_TRAFFIC_COOKIE}=1`)).toBe(true);
    expect(hasInternalCookieInHeader(`foo=bar; ${INTERNAL_TRAFFIC_COOKIE}=1; baz=2`)).toBe(true);
    expect(hasInternalCookieInHeader(`${INTERNAL_TRAFFIC_COOKIE}=0`)).toBe(false);
    expect(hasInternalCookieInHeader("")).toBe(false);
  });

  it("drops /admin URLs and internal browsers in beforeSend while keeping normal storefront visits", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/orders?status=pending")).toBe(true);
    expect(isAdminPath("https://aura-ardon.vercel.app/admin/settings")).toBe(true);
    expect(isAdminPath("/shop/watches")).toBe(false);

    expect(shouldDropTelemetryEvent("https://aura-ardon.vercel.app/admin", "")).toBe(true);
    expect(
      shouldDropTelemetryEvent("https://aura-ardon.vercel.app/checkout", "aa_internal=1")
    ).toBe(true);
    expect(
      shouldDropTelemetryEvent("https://aura-ardon.vercel.app/checkout", "theme=dark")
    ).toBe(false);
  });
});

describe("Round 2 Phase 2 — KPI clarity (AOV & Orders card headline)", () => {
  it("computes AOV as booked revenue / non-cancelled orders and returns null when 0 non-cancelled", () => {
    expect(computeAverageOrderValue(0, 0)).toBeNull();
    expect(computeAverageOrderValue(4500, 0)).toBeNull();
    expect(computeAverageOrderValue(0, 1)).toBe(0);
    expect(computeAverageOrderValue(9000, 2)).toBe(4500);
    expect(computeAverageOrderValue(10000, 3)).toBe(3333.33);
  });

  it("formats orders card headline cleanly so cancelled counts never look contradictory", () => {
    expect(formatOrdersCardHeadline(1, 1)).toBe("1 order · 1 cancelled");
    expect(formatOrdersCardHeadline(3, 1)).toBe("3 orders · 1 cancelled");
    expect(formatOrdersCardHeadline(1, 0)).toBe("1 order");
    expect(formatOrdersCardHeadline(0, 0)).toBe("0 orders");
  });
});

describe("Round 2 Phase 2 — Test order detection, report exclusion & TEST-INV PDF watermark", () => {
  it("auto-detects customer names starting with TEST without false positives", () => {
    expect(isTestOrderCustomerName("TEST")).toBe(true);
    expect(isTestOrderCustomerName("TEST Amina")).toBe(true);
    expect(isTestOrderCustomerName("  TEST-001")).toBe(true);
    expect(isTestOrderCustomerName("TESTBuyer")).toBe(true);
    expect(isTestOrderCustomerName("test order")).toBe(true);
    expect(isTestOrderCustomerName("Amina Wanjiku")).toBe(false);
    expect(isTestOrderCustomerName("Testa Kamau")).toBe(false);
  });

  it("detects TEST-INV invoices and excludes test orders/invoices from cash-up, monthly summary, margin, dispatch, and daily summary", () => {
    const realOrder = makeOrder({ id: "ord-real", is_test: false, total: "4200.00" });
    const testOrder = makeOrder({
      id: "ord-test",
      order_number: "AA-99999",
      customer_name: "TEST Buyer",
      is_test: true,
      total: "9900.00",
      shipping_fee: "500.00"
    });

    const realInv = makeInvoice({ id: "inv-real", order_id: "ord-real", is_test: false });
    const testInv = makeInvoice({
      id: "inv-test",
      invoice_number: "TEST-INV-0001",
      order_id: "ord-test",
      is_test: true,
      subtotal: "9400.00",
      delivery_fee: "500.00",
      total: "9900.00",
      amount_paid: "9900.00"
    });

    expect(isTestInvoice(realInv)).toBe(false);
    expect(isTestInvoice(testInv)).toBe(true);

    const payments: InvoicePayment[] = [
      {
        id: "pay-real",
        invoice_id: "inv-real",
        order_id: "ord-real",
        amount: "4200.00",
        method: "mpesa",
        mpesa_code: "SHK4P9X2M1",
        received_by: "Rider A",
        paid_at: "2026-11-27T09:00:00.000Z",
        note: null,
        created_by: "owner",
        created_at: "2026-11-27T09:00:00.000Z"
      },
      {
        id: "pay-test",
        invoice_id: "inv-test",
        order_id: "ord-test",
        amount: "9900.00",
        method: "cash",
        mpesa_code: null,
        received_by: "Owner",
        paid_at: "2026-11-27T09:05:00.000Z",
        note: null,
        created_by: "owner",
        created_at: "2026-11-27T09:05:00.000Z"
      }
    ];

    const cashup = buildDailyCashupReport(
      "2026-11-27",
      [realOrder, testOrder],
      [realInv, testInv],
      payments
    );
    expect(cashup.expectedInvoiceCount).toBe(1);
    expect(cashup.expectedTotal).toBe(4200);
    expect(cashup.collectedTotal).toBe(4200);

    const monthly = buildMonthlySummaryReport(
      "2026-11",
      [realInv, testInv],
      payments,
      []
    );
    expect(monthly.invoiceCount).toBe(1);
    expect(monthly.grossSales).toBe(4000);
    expect(monthly.totalCollected).toBe(4200);

    const margin = buildDeliveryMarginReport("2026-11-01", "2026-11-30", [
      realOrder,
      testOrder
    ]);
    expect(margin.orderCount).toBe(1);
    expect(margin.totalFeesCharged).toBe(200);

    const dispatch = buildDispatchSheetReport(
      "2026-11-27",
      [realOrder, testOrder],
      [],
      [realInv, testInv]
    );
    expect(dispatch.totalOrders).toBe(1);

    const summary = buildDailySummaryReport("2026-11-27", {
      orders: [realOrder, testOrder],
      invoices: [realInv, testInv],
      payments,
      returns: [],
      products: [],
      lowStockThreshold: 3
    });
    expect(summary.ordersTodayCount).toBe(1);
    expect(summary.bookedRevenue).toBe(4200);
    expect(summary.collectedRevenue).toBe(4200);
  });

  it("renders valid watermarked PDFs (A4 & 80mm receipt) for TEST-INV invoices", async () => {
    const bundle: InvoiceDetailBundle = {
      invoice: makeInvoice({
        invoice_number: "TEST-INV-0001",
        is_test: true,
        status: "unpaid",
        amount_paid: "0.00"
      }),
      payments: [],
      creditNotes: []
    };

    const [a4Buf, receiptBuf] = await Promise.all([
      renderInvoicePdfBuffer(bundle, "a4"),
      renderInvoicePdfBuffer(bundle, "receipt")
    ]);

    expect(a4Buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(receiptBuf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});

