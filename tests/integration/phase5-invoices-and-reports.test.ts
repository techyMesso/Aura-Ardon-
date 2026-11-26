import { beforeEach, describe, expect, it, vi } from "vitest";

const assertAdminRequest = vi.fn();
const rpcSingleMock = vi.fn();
const updateEqMock = vi.fn();
const getInvoiceDetailBundleMock = vi.fn();
const getInvoiceByShareTokenMock = vi.fn();
const getMonthlySummaryReportDataMock = vi.fn();
const getStoreSettingsMock = vi.fn();
const getOrGenerateInvoicePdfMock = vi.fn();

vi.mock("@/lib/auth", () => ({ assertAdminRequest }));
vi.mock("@/lib/data", () => ({
  getInvoiceDetailBundle: (...args: unknown[]) => getInvoiceDetailBundleMock(...args),
  getInvoiceByShareToken: (...args: unknown[]) => getInvoiceByShareTokenMock(...args),
  getMonthlySummaryReportData: (...args: unknown[]) =>
    getMonthlySummaryReportDataMock(...args),
  getStoreSettings: (...args: unknown[]) => getStoreSettingsMock(...args)
}));
vi.mock("@/lib/pdf/invoice-pdf", () => ({
  getOrGenerateInvoicePdf: (...args: unknown[]) => getOrGenerateInvoicePdfMock(...args),
  renderMonthlySummaryPdfBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4\n"))
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: (_fn: string, params: unknown) => ({
      single: () => rpcSingleMock(params)
    }),
    from: () => ({
      update: () => ({
        eq: updateEqMock
      })
    })
  })
}));

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";

const MOCK_BUNDLE = {
  invoice: {
    id: INVOICE_ID,
    invoice_number: "INV-2026-0001",
    order_id: "22222222-2222-4222-8222-222222222222",
    status: "unpaid",
    issued_at: "2026-05-12T09:00:00.000Z",
    due_at: "2026-05-19T09:00:00.000Z",
    etims_invoice_number: null,
    share_token: "b".repeat(48),
    share_expires_at: "2026-08-10T09:00:00.000Z",
    share_revoked: false,
    customer_snapshot: {
      full_name: "Amina Wanjiku",
      phone: "254712345678",
      address: "Sarit Centre"
    },
    lines_snapshot: [],
    business_snapshot: {
      site_name: "Auro Ardon",
      business_phone: "254718038825",
      business_address: "Nairobi"
    },
    subtotal: "2500.00",
    discount_code: null,
    discount_amount: "0.00",
    delivery_fee: "200.00",
    total: "2700.00",
    amount_paid: "0.00",
    credited_amount: "0.00"
  },
  payments: [],
  creditNotes: []
};

describe("Phase 5 invoice, payment, PDF share, and report API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertAdminRequest.mockResolvedValue({
      id: "admin-1",
      email: "aura.ardoncompany@gmail.com"
    });
    getInvoiceDetailBundleMock.mockResolvedValue(MOCK_BUNDLE);
    updateEqMock.mockResolvedValue({ error: null });
    getOrGenerateInvoicePdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
  });

  it("blocks DELETE /api/admin/invoices/[id] with 405 and rejects mutating financial fields", async () => {
    const { DELETE, PATCH } = await import("@/app/api/admin/invoices/[id]/route");

    const delRes = await DELETE();
    expect(delRes.status).toBe(405);

    const mutateTotalRes = await PATCH(
      new Request(`https://example.test/api/admin/invoices/${INVOICE_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ total: 1 })
      }),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );
    expect(mutateTotalRes.status).toBe(400);

    const metaRes = await PATCH(
      new Request(`https://example.test/api/admin/invoices/${INVOICE_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ etimsInvoiceNumber: "ETIMS-2026-01", shareRevoked: true })
      }),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );
    expect(metaRes.status).toBe(200);
  });

  it("validates M-Pesa codes and records payments via RPC", async () => {
    const { POST } = await import("@/app/api/admin/invoices/[id]/payments/route");

    const badMpesaRes = await POST(
      new Request(`https://example.test/api/admin/invoices/${INVOICE_ID}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: 1000,
          method: "mpesa",
          mpesaCode: "BAD",
          receivedBy: "Rider Brian"
        })
      }),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );
    expect(badMpesaRes.status).toBe(400);

    rpcSingleMock.mockResolvedValueOnce({
      data: {
        payment_id: "pay-1",
        invoice_id: INVOICE_ID,
        invoice_number: "INV-2026-0001",
        invoice_status: "partially_paid",
        amount_paid: 1000,
        balance_due: 1700
      },
      error: null
    });

    const okRes = await POST(
      new Request(`https://example.test/api/admin/invoices/${INVOICE_ID}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: 1000,
          method: "mpesa",
          mpesaCode: "shk4p9x2m1",
          receivedBy: "Rider Brian"
        })
      }),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );
    const json = await okRes.json();
    expect(okRes.status).toBe(201);
    expect(json.invoiceStatus).toBe("partially_paid");
    expect(rpcSingleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        p_mpesa_code: "SHK4P9X2M1",
        p_method: "mpesa"
      })
    );

    // Duplicate M-Pesa code -> 409
    rpcSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: "M-Pesa code SHK4P9X2M1 has already been recorded." }
    });
    const dupRes = await POST(
      new Request(`https://example.test/api/admin/invoices/${INVOICE_ID}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: 500,
          method: "mpesa",
          mpesaCode: "SHK4P9X2M1",
          receivedBy: "Rider Brian"
        })
      }),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );
    expect(dupRes.status).toBe(409);
  });

  it("gates public /api/i/[token]/pdf with 404 for invalid tokens and streams noindex PDF for valid tokens", async () => {
    const { GET } = await import("@/app/api/i/[token]/pdf/route");

    getInvoiceByShareTokenMock.mockResolvedValueOnce(null);
    const missingRes = await GET(
      new Request("https://aura-ardon.vercel.app/api/i/invalid/pdf"),
      { params: Promise.resolve({ token: "invalid" }) }
    );
    expect(missingRes.status).toBe(404);

    getInvoiceByShareTokenMock.mockResolvedValueOnce(MOCK_BUNDLE);
    const okRes = await GET(
      new Request(`https://aura-ardon.vercel.app/api/i/${"b".repeat(48)}/pdf?layout=receipt`),
      { params: Promise.resolve({ token: "b".repeat(48) }) }
    );
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("Content-Type")).toBe("application/pdf");
    expect(okRes.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(getOrGenerateInvoicePdfMock).toHaveBeenCalledWith(MOCK_BUNDLE, "receipt");
  });

  it("exports monthly summary CSV for the accountant", async () => {
    getMonthlySummaryReportDataMock.mockResolvedValueOnce({
      report: {
        month: "2026-05",
        invoiceCount: 1,
        creditNoteCount: 0,
        paymentCount: 0,
        grossSales: 2500,
        discounts: 0,
        deliveryFees: 200,
        creditNotesTotal: 0,
        netSales: 2700,
        cashCollected: 0,
        mpesaCollected: 0,
        totalCollected: 0
      },
      invoices: [MOCK_BUNDLE.invoice],
      payments: [],
      creditNotes: []
    });

    const { GET } = await import("@/app/api/admin/reports/monthly/route");
    const res = await GET(
      new Request("https://aura-ardon.vercel.app/api/admin/reports/monthly?month=2026-05&format=csv")
    );
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(text).toContain("INV-2026-0001");
    expect(text).toContain("2700.00");
  });
});

