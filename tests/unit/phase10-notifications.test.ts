import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildOrderTemplateLinks,
  getOrderStatusTemplateButtons,
  renderWhatsAppTemplate
} from "@/lib/message-templates";
import {
  buildDailySummaryReport,
  formatDailySummaryEmail,
  notifyNewOrder,
  sendAfricasTalkingSms,
  sendResendEmail
} from "@/lib/notifications";
import type {
  Invoice,
  InvoicePayment,
  Order,
  OrderReturnRecord,
  Product,
  ProductVariant
} from "@/lib/types";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    order_number: "AA-10001",
    status: "confirmed",
    order_status: "CONFIRMED",
    customer_name: "Amina Wanjiku",
    customer_email: null,
    customer_phone: "0712 345 678",
    customer_location: "Westlands",
    delivery_zone_name: "Westlands",
    delivery_address: "Sarit Centre",
    notes: null,
    rider_name: "Brian Otieno",
    rider_phone: "254711223344",
    payment_method: "WHATSAPP",
    payment_status: "PENDING",
    subtotal: "2500.00",
    shipping_fee: "200.00",
    total: "2700.00",
    created_at: "2026-05-15T08:00:00.000Z",
    ...overrides
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    invoice_number: "INV-2026-0001",
    order_id: "order-1",
    status: "unpaid",
    issued_at: "2026-05-15T08:05:00.000Z",
    due_at: "2026-05-22T08:05:00.000Z",
    etims_invoice_number: null,
    share_token: "a".repeat(48),
    share_expires_at: "2026-08-15T08:05:00.000Z",
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
      business_address: "Nairobi, Kenya"
    },
    subtotal: "2500.00",
    discount_code: null,
    discount_amount: "0.00",
    delivery_fee: "200.00",
    total: "2700.00",
    amount_paid: "0.00",
    credited_amount: "0.00",
    pdf_a4_path: null,
    pdf_receipt_path: null,
    created_by: "admin",
    created_at: "2026-05-15T08:05:00.000Z",
    updated_at: "2026-05-15T08:05:00.000Z",
    ...overrides
  };
}

describe("Phase 10 templates, Resend email, Africa's Talking SMS, and 20:00 EAT daily summary", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    delete process.env.ORDER_NOTIFY_EMAIL;
    delete process.env.AFRICAS_TALKING_SMS_ENABLED;
    delete process.env.AFRICAS_TALKING_API_KEY;
    delete process.env.AFRICAS_TALKING_USERNAME;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it("interpolates all 8 WhatsApp template placeholders and selects the right status buttons", () => {
    const rendered = renderWhatsAppTemplate(
      "Hi {name}, {order} KES {total}, rider {rider} ({rider_phone}), track {track_link}, inv {invoice_link}, review {review_link}",
      {
        name: "Amina",
        order: "AA-10001",
        total: 2700,
        rider: "Brian Otieno",
        rider_phone: "254711223344",
        track_link: "https://aura-ardon.vercel.app/order/AA-10001?t=abc",
        invoice_link: "https://aura-ardon.vercel.app/i/tok123",
        review_link: "https://aura-ardon.vercel.app/order/AA-10001?t=abc#review"
      }
    );

    expect(rendered).toContain("Hi Amina");
    expect(rendered).toContain("AA-10001 KES 2,700");
    expect(rendered).toContain("Brian Otieno (254711223344)");
    expect(rendered).toContain("https://aura-ardon.vercel.app/i/tok123");
    expect(rendered).toContain("#review");

    // Delivered + unpaid -> shows delivered&review primary + unpaid reminder secondary
    const deliveredOrder = makeOrder({
      status: "delivered",
      order_status: "DELIVERED",
      payment_status: "PENDING"
    });
    const unpaidInv = makeInvoice({ status: "partially_paid", amount_paid: "1000.00" });
    const urls = buildOrderTemplateLinks({
      order: deliveredOrder,
      invoice: unpaidInv,
      trackLink: "https://aura-ardon.vercel.app/order/AA-10001?t=abc",
      invoiceLink: "https://aura-ardon.vercel.app/i/tok123",
      reviewLink: "https://aura-ardon.vercel.app/order/AA-10001?t=abc#review"
    });
    const buttons = getOrderStatusTemplateButtons({
      order: deliveredOrder,
      invoice: unpaidInv,
      urls
    });

    expect(buttons.primary?.key).toBe("delivered");
    expect(buttons.primary?.url).toContain("https://wa.me/254712345678?text=");
    expect(decodeURIComponent(buttons.primary?.url ?? "")).toContain("#review");
    expect(buttons.unpaidReminderUrl).toBeTruthy();
    expect(decodeURIComponent(buttons.unpaidReminderUrl ?? "")).toContain("1,700");

    // Paid order hides unpaid reminder
    const paidButtons = getOrderStatusTemplateButtons({
      order: { ...deliveredOrder, payment_status: "PAID" },
      invoice: makeInvoice({ status: "paid", amount_paid: "2700.00" }),
      urls
    });
    expect(paidButtons.primary?.key).toBe("delivered");
    expect(paidButtons.unpaidReminderUrl).toBeNull();
  });

  it("skips Resend email when env vars are unset and never throws on provider failures", async () => {
    const skipped = await sendResendEmail({
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test"
    });
    expect(skipped.sent).toBe(false);
    expect(skipped.skipped).toBe(true);

    process.env.RESEND_API_KEY = "re_test_key";
    process.env.ORDER_NOTIFY_EMAIL = "owner@example.com";

    // Simulate Resend 500 error — must return sent: false without throwing
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    ) as unknown as typeof fetch;

    const failed = await sendResendEmail({
      subject: "New order",
      html: "<p>Order</p>",
      text: "Order"
    });
    expect(failed.sent).toBe(false);
    expect(failed.error).toContain("500");

    // Simulate successful delivery
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email_123" }), { status: 200 })
    ) as unknown as typeof fetch;

    const ok = await sendResendEmail({
      subject: "New order",
      html: "<p>Order</p>",
      text: "Order"
    });
    expect(ok.sent).toBe(true);
    expect(ok.id).toBe("email_123");
  });

  it("keeps Africa's Talking SMS off by default and sends only when both flags + credentials are enabled", async () => {
    const offByDefault = await sendAfricasTalkingSms({
      to: "0712 345 678",
      message: "Hello",
      enabledInStoreSettings: false
    });
    expect(offByDefault.skipped).toBe(true);

    process.env.AFRICAS_TALKING_SMS_ENABLED = "true";
    process.env.AFRICAS_TALKING_API_KEY = "at_secret";
    process.env.AFRICAS_TALKING_USERNAME = "sandbox";

    // Still skipped if store toggle is off
    const storeOff = await sendAfricasTalkingSms({
      to: "0712 345 678",
      message: "Hello",
      enabledInStoreSettings: false
    });
    expect(storeOff.skipped).toBe(true);

    const fetchSpy = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ SMSMessageData: { Message: "Sent" } }), {
        status: 201
      })
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const sent = await sendAfricasTalkingSms({
      to: "0712 345 678",
      message: "Order AA-10001 confirmed",
      enabledInStoreSettings: true
    });
    expect(sent.sent).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.sandbox.africastalking.com/version1/messaging",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("ensures notifyNewOrder never throws even if network fails", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.ORDER_NOTIFY_EMAIL = "owner@example.com";
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("Network down")) as unknown as typeof fetch;

    const result = await notifyNewOrder({
      orderId: "order-1",
      orderNumber: "AA-10001",
      customerName: "Amina",
      customerPhone: "254712345678",
      deliveryZoneName: "Westlands",
      deliveryAddress: "Sarit Centre",
      subtotal: 2500,
      discountAmount: 0,
      shippingFee: 200,
      total: 2700,
      items: [{ title: "Classic Watch", quantity: 1, lineTotal: 2500 }],
      trackUrl: "https://aura-ardon.vercel.app/order/AA-10001?t=abc",
      smsNotificationsEnabled: false
    });

    expect(result.email.sent).toBe(false);
    expect(result.push.skipped).toBe(true);
    expect(result.sms.skipped).toBe(true);
  });

  it("computes the 20:00 EAT daily summary (orders, booked/collected, pending, low stock, cash to collect)", () => {
    const orders: Order[] = [
      makeOrder({
        id: "o1",
        status: "delivered",
        order_status: "DELIVERED",
        total: "2700.00",
        created_at: "2026-05-15T07:00:00.000Z" // 10:00 EAT
      }),
      makeOrder({
        id: "o2",
        status: "dispatched",
        order_status: "OUT_FOR_DELIVERY",
        total: "3500.00",
        created_at: "2026-05-15T09:00:00.000Z"
      }),
      makeOrder({
        id: "o3",
        status: "pending",
        order_status: "PENDING_CONFIRMATION",
        total: "1800.00",
        created_at: "2026-05-13T08:00:00.000Z" // >24h overdue!
      }),
      makeOrder({
        id: "o4",
        status: "cancelled",
        order_status: "CANCELLED",
        total: "5000.00",
        created_at: "2026-05-15T10:00:00.000Z"
      })
    ];

    const invoices: Invoice[] = [
      makeInvoice({
        id: "inv-1",
        order_id: "o1",
        status: "paid",
        total: "2700.00",
        amount_paid: "2700.00"
      }),
      makeInvoice({
        id: "inv-2",
        order_id: "o2",
        status: "partially_paid",
        total: "3500.00",
        amount_paid: "1000.00"
      })
    ];

    const payments: InvoicePayment[] = [
      {
        id: "p1",
        invoice_id: "inv-1",
        order_id: "o1",
        amount: "2700.00",
        method: "mpesa",
        mpesa_code: "SHK4P9X2M1",
        received_by: "Brian Otieno",
        paid_at: "2026-05-15T11:00:00.000Z",
        note: null,
        created_by: "admin",
        created_at: "2026-05-15T11:00:00.000Z"
      },
      {
        id: "p2",
        invoice_id: "inv-2",
        order_id: "o2",
        amount: "1000.00",
        method: "cash",
        mpesa_code: null,
        received_by: "Brian Otieno",
        paid_at: "2026-05-15T12:00:00.000Z",
        note: null,
        created_by: "admin",
        created_at: "2026-05-15T12:00:00.000Z"
      }
    ];

    const returns: OrderReturnRecord[] = [
      {
        id: "r1",
        order_id: "o1",
        order_item_id: null,
        product_id: "prod-1",
        product_title: "Classic Watch",
        quantity: 1,
        unit_price: "500.00",
        refund_amount: "500.00",
        condition: "resellable",
        note: null,
        created_by: "admin",
        created_at: "2026-05-15T13:00:00.000Z"
      }
    ];

    const products: Pick<Product, "id" | "title" | "stock_quantity" | "status" | "active">[] = [
      { id: "prod-1", title: "Classic Watch", stock_quantity: 2, status: "active", active: true },
      { id: "prod-2", title: "Draft Watch", stock_quantity: 0, status: "draft", active: false },
      { id: "prod-3", title: "Pearl Earrings", stock_quantity: 8, status: "active", active: true }
    ];
    const variants: Pick<
      ProductVariant,
      "id" | "product_id" | "name" | "stock_quantity" | "active"
    >[] = [
      { id: "v1", product_id: "prod-3", name: "Gold", stock_quantity: 0, active: true },
      { id: "v2", product_id: "prod-3", name: "Silver", stock_quantity: 8, active: true }
    ];

    const summary = buildDailySummaryReport("2026-05-15", {
      orders,
      invoices,
      payments,
      returns,
      products,
      variants,
      lowStockThreshold: 3,
      nowMs: Date.parse("2026-05-15T17:00:00.000Z")
    });

    expect(summary.ordersTodayCount).toBe(2); // o1 + o2 (o4 cancelled excluded)
    expect(summary.ordersTodayByStatus.cancelled).toBe(1);
    expect(summary.bookedRevenue).toBe(2700 + 3500 - 500);
    expect(summary.collectedRevenue).toBe(3700);
    expect(summary.collectedCash).toBe(1000);
    expect(summary.collectedMpesa).toBe(2700);
    expect(summary.pendingOrdersCount).toBe(1);
    expect(summary.overduePending24hCount).toBe(1);
    expect(summary.cashStillToCollectCount).toBe(1);
    expect(summary.cashStillToCollectTotal).toBe(2500); // 3500 - 1000 paid on o2
    expect(summary.lowStockCount).toBe(2); // Classic Watch (2) + Pearl Earrings (Gold, 0)
    expect(summary.outOfStockCount).toBe(1);

    const formatted = formatDailySummaryEmail(summary);
    expect(formatted.subject).toContain("2026-05-15");
    expect(formatted.text).toContain("KES 3,700");
    expect(formatted.text).toContain("Pearl Earrings (Gold)");
  });
});

