import { describe, expect, it } from "vitest";

import { buildDailyCashupReport } from "@/lib/invoices";
import {
  buildDeliveryMarginCsv,
  buildDeliveryMarginReport,
  buildDispatchedWhatsAppUrl,
  buildDispatchSheetReport,
  computeOrderAmountToCollect,
  interpolateDispatchedTemplate,
  resolveRiderCostForZone,
  sanitizeZoneCosts
} from "@/lib/riders";
import type { Invoice, InvoicePayment, Order, OrderItem, Rider } from "@/lib/types";

const ZONE_WESTLANDS = "11111111-1111-4111-8111-111111111111";
const ZONE_KAREN = "22222222-2222-4222-8222-222222222222";
const RIDER_BRIAN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RIDER_JANE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const RIDER_BRIAN: Rider = {
  id: RIDER_BRIAN_ID,
  name: "Brian Otieno",
  phone: "254711223344",
  active: true,
  default_cost: 200,
  zone_costs: {
    [ZONE_KAREN]: 350,
    [ZONE_WESTLANDS]: 150
  },
  notes: "Westlands / Karen boda",
  created_at: "2026-05-01T08:00:00.000Z",
  updated_at: "2026-05-01T08:00:00.000Z"
};

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    order_number: "AA-90001",
    status: "dispatched",
    order_status: "OUT_FOR_DELIVERY",
    customer_name: "Amina Wanjiku",
    customer_email: null,
    customer_phone: "0712 345 678",
    customer_location: "Westlands",
    delivery_zone_id: ZONE_WESTLANDS,
    delivery_zone_name: "Westlands",
    delivery_address: "Sarit Centre, Ground Floor",
    town_county: null,
    notes: "Call on arrival",
    is_gift: false,
    hide_prices: false,
    rider_id: RIDER_BRIAN_ID,
    rider_name: "Brian Otieno",
    rider_phone: "254711223344",
    rider_cost: "150.00",
    dispatched_at: "2026-05-15T09:00:00.000Z",
    payment_method: "WHATSAPP",
    payment_status: "PENDING",
    subtotal: "2500.00",
    shipping_fee: "200.00",
    total: "2700.00",
    created_at: "2026-05-14T16:00:00.000Z",
    ...overrides
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    invoice_number: "INV-2026-0010",
    order_id: "order-1",
    status: "unpaid",
    issued_at: "2026-05-14T17:00:00.000Z",
    due_at: "2026-05-21T17:00:00.000Z",
    etims_invoice_number: null,
    share_token: "a".repeat(48),
    share_expires_at: "2026-08-14T17:00:00.000Z",
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
    created_at: "2026-05-14T17:00:00.000Z",
    updated_at: "2026-05-14T17:00:00.000Z",
    ...overrides
  };
}

describe("Phase 9 delivery, riders, dispatch sheet, margin, and rider cash-up", () => {
  it("resolves per-zone rider costs with fallback to default cost and sanitizes inputs", () => {
    expect(resolveRiderCostForZone(RIDER_BRIAN, ZONE_WESTLANDS)).toBe(150);
    expect(resolveRiderCostForZone(RIDER_BRIAN, ZONE_KAREN)).toBe(350);
    expect(resolveRiderCostForZone(RIDER_BRIAN, "unknown-zone")).toBe(200);
    expect(resolveRiderCostForZone(RIDER_BRIAN, null)).toBe(200);

    expect(
      sanitizeZoneCosts({
        [ZONE_WESTLANDS]: "175.5",
        [ZONE_KAREN]: 0,
        invalidNeg: -50,
        blank: "",
        nanVal: "abc"
      })
    ).toEqual({
      [ZONE_WESTLANDS]: 175.5,
      [ZONE_KAREN]: 0
    });
  });

  it("interpolates dispatched WhatsApp template with assigned rider name and phone", () => {
    const text = interpolateDispatchedTemplate({
      customerName: "Amina Wanjiku",
      orderNumber: "AA-90001",
      riderName: "Brian Otieno",
      riderPhone: "254711223344",
      total: 2700,
      trackLink: "https://aura-ardon.vercel.app/order/AA-90001?t=sig"
    });
    expect(text).toContain("Amina Wanjiku");
    expect(text).toContain("AA-90001");
    expect(text).toContain("Brian Otieno (254711223344)");
    expect(text).toContain("KES 2,700");
    expect(text).toContain("https://aura-ardon.vercel.app/order/AA-90001?t=sig");

    // Gracefully removes empty parentheses when unassigned
    const unassignedText = interpolateDispatchedTemplate({
      customerName: "Amina",
      orderNumber: "AA-90001",
      riderName: null,
      riderPhone: null,
      total: 2700,
      trackLink: "https://aura-ardon.vercel.app/track"
    });
    expect(unassignedText).not.toContain("()");

    const waUrl = buildDispatchedWhatsAppUrl({
      order: makeOrder(),
      trackLink: "https://aura-ardon.vercel.app/order/AA-90001?t=sig",
      amountToCollect: 1700
    });
    expect(waUrl).toContain("https://wa.me/254712345678?text=");
    const decoded = decodeURIComponent(waUrl ?? "");
    expect(decoded).toContain("Brian Otieno (254711223344)");
    expect(decoded).toContain("KES 1,700");
  });

  it("computes exact amount to collect respecting partial payments, credit notes, and paid status", () => {
    const order = makeOrder({ total: "2700.00" });
    expect(computeOrderAmountToCollect(order, null)).toBe(2700);
    expect(
      computeOrderAmountToCollect(makeOrder({ payment_status: "PAID" }), null)
    ).toBe(0);
    expect(
      computeOrderAmountToCollect(
        order,
        makeInvoice({ status: "partially_paid", amount_paid: "1000.00" })
      )
    ).toBe(1700);
    expect(
      computeOrderAmountToCollect(
        order,
        makeInvoice({ status: "partially_paid", amount_paid: "1000.00", credited_amount: "500.00" })
      )
    ).toBe(1200);
    expect(
      computeOrderAmountToCollect(order, makeInvoice({ status: "paid", amount_paid: "2700.00" }))
    ).toBe(0);
    expect(
      computeOrderAmountToCollect(makeOrder({ status: "cancelled", order_status: "CANCELLED" }), null)
    ).toBe(0);
  });

  it("builds printable daily dispatch sheet grouped by rider with items and amount to collect", () => {
    const order1 = makeOrder({
      id: "order-1",
      order_number: "AA-90001",
      dispatched_at: "2026-05-15T09:00:00.000Z", // 12:00 EAT on 2026-05-15
      rider_id: RIDER_BRIAN_ID,
      rider_name: "Brian Otieno",
      rider_phone: "254711223344",
      rider_cost: "150.00",
      total: "2700.00"
    });
    const order2 = makeOrder({
      id: "order-2",
      order_number: "AA-90002",
      customer_name: "David Kamau",
      customer_phone: "254722111000",
      delivery_zone_id: ZONE_KAREN,
      delivery_zone_name: "Karen",
      delivery_address: "The Hub Karen",
      dispatched_at: "2026-05-15T11:30:00.000Z",
      rider_id: RIDER_JANE_ID,
      rider_name: "Jane Wambui",
      rider_phone: "254733445566",
      rider_cost: "300.00",
      shipping_fee: "350.00",
      total: "4350.00"
    });
    const confirmedToday = makeOrder({
      id: "order-3",
      order_number: "AA-90003",
      status: "confirmed",
      order_status: "CONFIRMED",
      dispatched_at: null,
      created_at: "2026-05-15T07:00:00.000Z",
      rider_id: null,
      rider_name: null,
      rider_phone: null,
      rider_cost: null,
      total: "1800.00"
    });
    const cancelledToday = makeOrder({
      id: "order-4",
      order_number: "AA-90004",
      status: "cancelled",
      order_status: "CANCELLED",
      dispatched_at: "2026-05-15T08:00:00.000Z"
    });

    const items: OrderItem[] = [
      {
        id: "item-1",
        order_id: "order-1",
        product_id: "p1",
        variant_name: "Gold / 40mm",
        product_title: "Nairobi Classic Watch",
        quantity: 2,
        unit_price: "1250.00",
        created_at: "2026-05-14T16:00:00.000Z"
      },
      {
        id: "item-2",
        order_id: "order-2",
        product_id: "p2",
        product_title: "Leather Tote",
        quantity: 1,
        unit_price: "4000.00",
        created_at: "2026-05-15T07:00:00.000Z"
      }
    ];

    const invoices: Invoice[] = [
      makeInvoice({
        id: "inv-1",
        order_id: "order-1",
        status: "partially_paid",
        amount_paid: "1000.00"
      })
    ];

    const sheet = buildDispatchSheetReport(
      "2026-05-15",
      [order1, order2, confirmedToday, cancelledToday],
      items,
      invoices
    );

    expect(sheet.totalOrders).toBe(2);
    expect(sheet.totalAmountToCollect).toBe(1700 + 4350);
    expect(sheet.totalRiderCost).toBe(450);
    expect(sheet.byRider).toHaveLength(2);
    expect(sheet.byRider[0]?.riderName).toBe("Brian Otieno");
    expect(sheet.byRider[0]?.rows[0]?.itemsSummary).toBe(
      "2 × Nairobi Classic Watch (Gold / 40mm)"
    );
    expect(sheet.byRider[0]?.rows[0]?.amountToCollect).toBe(1700);

    // Filter by rider + includeConfirmed
    const withConfirmed = buildDispatchSheetReport(
      "2026-05-15",
      [order1, order2, confirmedToday, cancelledToday],
      items,
      invoices,
      { includeConfirmed: true }
    );
    expect(withConfirmed.totalOrders).toBe(3);

    const onlyBrian = buildDispatchSheetReport(
      "2026-05-15",
      [order1, order2, confirmedToday],
      items,
      invoices,
      { riderId: RIDER_BRIAN_ID }
    );
    expect(onlyBrian.totalOrders).toBe(1);
    expect(onlyBrian.rows[0]?.orderNumber).toBe("AA-90001");
  });

  it("calculates delivery margin (fees charged vs rider costs) by zone and by rider plus CSV", () => {
    const orders: Order[] = [
      makeOrder({
        id: "o1",
        order_number: "AA-1",
        status: "delivered",
        order_status: "DELIVERED",
        delivery_zone_name: "Westlands",
        shipping_fee: "200.00",
        rider_id: RIDER_BRIAN_ID,
        rider_name: "Brian Otieno",
        rider_cost: "150.00",
        dispatched_at: "2026-05-10T10:00:00.000Z"
      }),
      makeOrder({
        id: "o2",
        order_number: "AA-2",
        status: "delivered",
        order_status: "DELIVERED",
        delivery_zone_name: "Karen",
        shipping_fee: "0.00", // free delivery threshold applied!
        rider_id: RIDER_BRIAN_ID,
        rider_name: "Brian Otieno",
        rider_cost: "350.00",
        dispatched_at: "2026-05-12T10:00:00.000Z"
      }),
      makeOrder({
        id: "o3",
        order_number: "AA-3",
        status: "dispatched",
        delivery_zone_name: "Westlands",
        shipping_fee: "200.00",
        rider_id: RIDER_JANE_ID,
        rider_name: "Jane Wambui",
        rider_cost: null, // missing cost
        dispatched_at: "2026-05-14T10:00:00.000Z"
      }),
      makeOrder({
        id: "o4",
        order_number: "AA-4",
        status: "cancelled",
        order_status: "CANCELLED",
        shipping_fee: "300.00",
        rider_cost: "250.00",
        dispatched_at: "2026-05-14T10:00:00.000Z"
      })
    ];

    const report = buildDeliveryMarginReport("2026-05-01", "2026-05-31", orders);

    expect(report.orderCount).toBe(3);
    expect(report.ordersWithRiderCost).toBe(2);
    expect(report.ordersMissingRiderCost).toBe(1);
    expect(report.totalFeesCharged).toBe(400);
    expect(report.totalRiderCosts).toBe(500);
    expect(report.netMargin).toBe(-100);
    expect(report.marginPercent).toBe(-25);
    expect(report.byZone).toHaveLength(2);
    expect(report.byRider).toHaveLength(2);

    const csv = buildDeliveryMarginCsv(report);
    expect(csv).toContain("Auro Ardon Delivery Margin Report");
    expect(csv).toContain("Westlands");
    expect(csv).toContain("Brian Otieno");
    expect(csv).toContain("-100.00");
  });

  it("groups Phase 5 daily cash-up by assigned rider with expected, collected, difference, and rider cost", () => {
    const orderBrian = makeOrder({
      id: "order-1",
      order_number: "AA-90001",
      dispatched_at: "2026-05-15T08:00:00.000Z", // dispatched today (invoice was issued yesterday!)
      rider_id: RIDER_BRIAN_ID,
      rider_name: "Brian Otieno",
      rider_phone: "254711223344",
      rider_cost: "150.00",
      total: "2700.00"
    });
    const orderJane = makeOrder({
      id: "order-2",
      order_number: "AA-90002",
      dispatched_at: "2026-05-15T09:00:00.000Z",
      rider_id: RIDER_JANE_ID,
      rider_name: "Jane Wambui",
      rider_phone: "254733445566",
      rider_cost: "300.00",
      total: "4000.00"
    });

    const invBrian = makeInvoice({
      id: "inv-1",
      invoice_number: "INV-2026-0010",
      order_id: "order-1",
      issued_at: "2026-05-14T16:00:00.000Z",
      total: "2700.00"
    });
    const invJane = makeInvoice({
      id: "inv-2",
      invoice_number: "INV-2026-0011",
      order_id: "order-2",
      issued_at: "2026-05-15T08:00:00.000Z",
      total: "4000.00"
    });

    const payments: InvoicePayment[] = [
      {
        id: "p1",
        invoice_id: "inv-1",
        order_id: "order-1",
        amount: "1200.00",
        method: "cash",
        mpesa_code: null,
        received_by: "Brian Otieno",
        paid_at: "2026-05-15T11:00:00.000Z",
        note: null,
        created_by: "admin",
        created_at: "2026-05-15T11:00:00.000Z"
      },
      {
        id: "p2",
        invoice_id: "inv-1",
        order_id: "order-1",
        amount: "1500.00",
        method: "mpesa",
        mpesa_code: "SHK4P9X2M1",
        received_by: "Admin", // paid directly to till, still reconciles under Brian's delivery
        paid_at: "2026-05-15T11:05:00.000Z",
        note: null,
        created_by: "admin",
        created_at: "2026-05-15T11:05:00.000Z"
      },
      {
        id: "p3",
        invoice_id: "inv-2",
        order_id: "order-2",
        amount: "3500.00",
        method: "cash",
        mpesa_code: null,
        received_by: "Jane Wambui",
        paid_at: "2026-05-15T12:00:00.000Z",
        note: null,
        created_by: "admin",
        created_at: "2026-05-15T12:00:00.000Z"
      }
    ];

    const report = buildDailyCashupReport(
      "2026-05-15",
      [orderBrian, orderJane],
      [invBrian, invJane],
      payments
    );

    expect(report.expectedTotal).toBe(6700);
    expect(report.collectedTotal).toBe(6200);
    expect(report.difference).toBe(-500);
    expect(report.totalRiderCost).toBe(450);
    expect(report.byRider).toHaveLength(2);

    const janeRow = report.byRider.find(r => r.riderId === RIDER_JANE_ID);
    const brianRow = report.byRider.find(r => r.riderId === RIDER_BRIAN_ID);

    expect(brianRow).toMatchObject({
      receivedBy: "Brian Otieno",
      expectedTotal: 2700,
      cashTotal: 1200,
      mpesaTotal: 1500,
      totalCollected: 2700,
      difference: 0,
      deliveryCount: 1,
      riderCostTotal: 150,
      mpesaCodes: ["SHK4P9X2M1"]
    });
    expect(janeRow).toMatchObject({
      receivedBy: "Jane Wambui",
      expectedTotal: 4000,
      cashTotal: 3500,
      mpesaTotal: 0,
      totalCollected: 3500,
      difference: -500,
      deliveryCount: 1,
      riderCostTotal: 300
    });
  });
});

