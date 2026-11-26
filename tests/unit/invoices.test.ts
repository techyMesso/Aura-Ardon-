import { describe, expect, it } from "vitest";

import {
  buildDailyCashupReport,
  buildInvoiceShareWhatsAppUrl,
  buildMonthlySummaryCsv,
  buildMonthlySummaryReport,
  computeInvoiceBalanceDue,
  getInvoiceDocumentTitle,
  isShareTokenActive,
  isValidMpesaCode,
  normalizeMpesaCode
} from "@/lib/invoices";
import {
  renderInvoicePdfBuffer,
  renderMonthlySummaryPdfBuffer
} from "@/lib/pdf/invoice-pdf";
import type {
  CreditNote,
  Invoice,
  InvoiceDetailBundle,
  InvoicePayment,
  Order
} from "@/lib/types";

const SAMPLE_INVOICE: Invoice = {
  id: "11111111-1111-4111-8111-111111111111",
  invoice_number: "INV-2026-0001",
  order_id: "22222222-2222-4222-8222-222222222222",
  status: "partially_paid",
  issued_at: "2026-05-12T09:00:00.000Z",
  due_at: "2026-05-19T09:00:00.000Z",
  etims_invoice_number: null,
  share_token: "a".repeat(48),
  share_expires_at: "2026-08-10T09:00:00.000Z",
  share_revoked: false,
  customer_snapshot: {
    full_name: "Amina Wanjiku",
    phone: "254712345678",
    address: "Sarit Centre, Westlands",
    delivery_zone_name: "Westlands",
    order_number: "AA-7F3K2"
  },
  lines_snapshot: [
    {
      name: "Nairobi Classic Watch",
      sku: "AA-NAIROBI-1234",
      qty: 1,
      unit_price: 2500,
      line_total: 2500
    }
  ],
  business_snapshot: {
    site_name: "Auro Ardon",
    business_phone: "254718038825",
    business_address: "Nairobi, Kenya",
    currency: "KES",
    invoice_footer: "Thank you for shopping with Auro Ardon, Nairobi.",
    payment_instructions: "Pay via Cash or M-Pesa on delivery."
  },
  subtotal: "2500.00",
  discount_code: null,
  discount_amount: "0.00",
  delivery_fee: "200.00",
  total: "2700.00",
  amount_paid: "1000.00",
  credited_amount: "0.00",
  pdf_a4_path: null,
  pdf_receipt_path: null,
  created_by: "admin@test",
  created_at: "2026-05-12T09:00:00.000Z",
  updated_at: "2026-05-12T09:00:00.000Z"
};

describe("Phase 5 invoices, M-Pesa validation, cash-up, monthly summary & PDF", () => {
  it("validates and normalizes Kenyan M-Pesa confirmation codes", () => {
    expect(normalizeMpesaCode(" shk4p9x2m1 ")).toBe("SHK4P9X2M1");
    expect(isValidMpesaCode("SHK4P9X2M1")).toBe(true);
    expect(isValidMpesaCode("tbf8n1x0q4ab")).toBe(true);
    expect(isValidMpesaCode("SHORT")).toBe(false);
    expect(isValidMpesaCode("SHK4-P9X2M1")).toBe(false);
  });

  it("titles documents strictly as Invoice or Receipt (never Tax Invoice)", () => {
    expect(getInvoiceDocumentTitle({ status: "unpaid" })).toBe("Invoice");
    expect(getInvoiceDocumentTitle({ status: "partially_paid" })).toBe("Invoice");
    expect(getInvoiceDocumentTitle({ status: "void" })).toBe("Invoice");
    expect(getInvoiceDocumentTitle({ status: "paid" })).toBe("Receipt");
  });

  it("computes balance due and enforces 90-day / revoked share tokens", () => {
    expect(computeInvoiceBalanceDue(SAMPLE_INVOICE)).toBe(1700);
    expect(
      computeInvoiceBalanceDue({
        total: "2700.00",
        credited_amount: "700.00",
        amount_paid: "2000.00"
      })
    ).toBe(0);

    const activeNow = Date.parse("2026-06-01T00:00:00.000Z");
    const expiredNow = Date.parse("2026-09-01T00:00:00.000Z");
    expect(isShareTokenActive(SAMPLE_INVOICE, activeNow)).toBe(true);
    expect(isShareTokenActive(SAMPLE_INVOICE, expiredNow)).toBe(false);
    expect(
      isShareTokenActive({ ...SAMPLE_INVOICE, share_revoked: true }, activeNow)
    ).toBe(false);

    const waUrl = buildInvoiceShareWhatsAppUrl(
      SAMPLE_INVOICE,
      `https://aura-ardon.vercel.app/i/${SAMPLE_INVOICE.share_token}`
    );
    expect(waUrl).toContain("https://wa.me/254712345678?text=");
    expect(decodeURIComponent(waUrl ?? "")).toContain("INV-2026-0001");
  });

  it("computes daily cash-up with expected vs collected, M-Pesa codes, and per-rider totals", () => {
    const orders: Order[] = [
      {
        id: SAMPLE_INVOICE.order_id,
        order_number: "AA-7F3K2",
        status: "delivered",
        order_status: "DELIVERED",
        payment_method: "WHATSAPP",
        payment_status: "PENDING",
        customer_name: "Amina Wanjiku",
        customer_email: null,
        customer_phone: "254712345678",
        customer_location: "Westlands",
        notes: null,
        subtotal: "2500.00",
        shipping_fee: "200.00",
        total: "2700.00",
        created_at: "2026-05-12T08:00:00.000Z"
      }
    ];
    const payments: InvoicePayment[] = [
      {
        id: "pay-1",
        invoice_id: SAMPLE_INVOICE.id,
        order_id: SAMPLE_INVOICE.order_id,
        amount: "1000.00",
        method: "cash",
        mpesa_code: null,
        received_by: "Rider Brian",
        paid_at: "2026-05-12T11:00:00.000Z",
        note: null,
        created_by: "admin",
        created_at: "2026-05-12T11:00:00.000Z"
      },
      {
        id: "pay-2",
        invoice_id: SAMPLE_INVOICE.id,
        order_id: SAMPLE_INVOICE.order_id,
        amount: "1500.00",
        method: "mpesa",
        mpesa_code: "SHK4P9X2M1",
        received_by: "Rider Brian",
        paid_at: "2026-05-12T12:00:00.000Z",
        note: null,
        created_by: "admin",
        created_at: "2026-05-12T12:00:00.000Z"
      }
    ];

    const report = buildDailyCashupReport(
      "2026-05-12",
      orders,
      [SAMPLE_INVOICE],
      payments
    );

    expect(report.expectedTotal).toBe(2700);
    expect(report.collectedTotal).toBe(2500);
    expect(report.difference).toBe(-200);
    expect(report.cashTotal).toBe(1000);
    expect(report.mpesaTotal).toBe(1500);
    expect(report.mpesaPayments).toHaveLength(1);
    expect(report.mpesaPayments[0]?.mpesaCode).toBe("SHK4P9X2M1");
    expect(report.byRider).toHaveLength(1);
    expect(report.byRider[0]?.receivedBy).toBe("Rider Brian");
    expect(report.byRider[0]?.totalCollected).toBe(2500);
  });

  it("computes monthly summary and generates accountant CSV", () => {
    const creditNotes: CreditNote[] = [
      {
        id: "cn-1",
        credit_note_number: "CN-2026-0001",
        invoice_id: SAMPLE_INVOICE.id,
        order_id: SAMPLE_INVOICE.order_id,
        reason: "Partial return",
        lines: [],
        amount: "500.00",
        created_by: "admin",
        created_at: "2026-05-14T10:00:00.000Z"
      }
    ];
    const payments: InvoicePayment[] = [
      {
        id: "pay-1",
        invoice_id: SAMPLE_INVOICE.id,
        order_id: SAMPLE_INVOICE.order_id,
        amount: "2200.00",
        method: "mpesa",
        mpesa_code: "TBF8N1X0Q4",
        received_by: "Admin",
        paid_at: "2026-05-12T12:00:00.000Z",
        note: null,
        created_by: "admin",
        created_at: "2026-05-12T12:00:00.000Z"
      }
    ];

    const summary = buildMonthlySummaryReport(
      "2026-05",
      [SAMPLE_INVOICE],
      payments,
      creditNotes
    );

    expect(summary.grossSales).toBe(2500);
    expect(summary.deliveryFees).toBe(200);
    expect(summary.creditNotesTotal).toBe(500);
    expect(summary.netSales).toBe(2200);
    expect(summary.mpesaCollected).toBe(2200);
    expect(summary.cashCollected).toBe(0);

    const csv = buildMonthlySummaryCsv(
      summary,
      [SAMPLE_INVOICE],
      payments,
      creditNotes
    );
    expect(csv).toContain("INV-2026-0001");
    expect(csv).toContain("TBF8N1X0Q4");
    expect(csv).toContain("CN-2026-0001");
  });

  it("renders valid server-side PDFs for A4, 80mm receipt, and monthly summary", async () => {
    const bundle: InvoiceDetailBundle = {
      invoice: { ...SAMPLE_INVOICE, status: "paid", amount_paid: "2700.00" },
      payments: [
        {
          id: "pay-1",
          invoice_id: SAMPLE_INVOICE.id,
          order_id: SAMPLE_INVOICE.order_id,
          amount: "2700.00",
          method: "mpesa",
          mpesa_code: "SHK4P9X2M1",
          received_by: "Rider Brian",
          paid_at: "2026-05-12T12:00:00.000Z",
          note: null,
          created_by: "admin",
          created_at: "2026-05-12T12:00:00.000Z"
        }
      ],
      creditNotes: []
    };

    const [a4Buf, receiptBuf, monthlyBuf] = await Promise.all([
      renderInvoicePdfBuffer(bundle, "a4"),
      renderInvoicePdfBuffer(bundle, "receipt"),
      renderMonthlySummaryPdfBuffer(
        {
          month: "2026-05",
          invoiceCount: 1,
          creditNoteCount: 0,
          paymentCount: 1,
          grossSales: 2500,
          discounts: 0,
          deliveryFees: 200,
          creditNotesTotal: 0,
          netSales: 2700,
          cashCollected: 0,
          mpesaCollected: 2700,
          totalCollected: 2700
        },
        {
          site_name: "Auro Ardon",
          business_address: "Nairobi, Kenya",
          business_phone: "254718038825",
          kra_pin: null
        }
      )
    ]);

    expect(a4Buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(receiptBuf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(monthlyBuf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});

