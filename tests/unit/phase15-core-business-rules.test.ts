import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it, vi } from "vitest";

import {
  canCancelOrderStatus,
  canReturnOrderStatus,
  formatOrderDisplayNumber,
  getNextValidCanonicalStatuses,
  isPendingOrderOverdue24h,
  isValidOrderStatusTransition,
  resolveCanonicalOrderStatus
} from "@/lib/admin-orders";
import {
  discountCodePayloadSchema,
  formatDiscountValueLabel,
  getDiscountLifecycleStatus,
  getSaleSavingsPercent,
  isProductOnSale,
  normalizeDiscountCode
} from "@/lib/discounts";
import {
  computeInvoiceBalanceDue,
  getInvoiceDocumentTitle,
  isValidMpesaCode,
  normalizeMpesaCode
} from "@/lib/invoices";
import { logger } from "@/lib/logger";
import { scrubPiiDeep, scrubPiiString, scrubSentryEvent } from "@/lib/sentry-scrub";
import {
  formatCurrency,
  formatWhatsAppNumber,
  normalizeKenyanPhoneNumber,
  normalizeWhatsAppNumber
} from "@/lib/utils";
import {
  buildWhatsAppCheckoutUrl,
  calculateCheckoutTotals,
  MAX_WHATSAPP_URL_LENGTH
} from "@/lib/whatsapp-order";

describe("Phase 15 unit tests: phone normalisation", () => {
  it("normalizes 07xx, 01xx, +2547xx, +2541xx, and bare 9-digit Kenyan numbers to 254...", () => {
    expect(normalizeKenyanPhoneNumber("0712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhoneNumber("0110-223-344")).toBe("254110223344");
    expect(normalizeKenyanPhoneNumber("+254 722 000 111")).toBe("254722000111");
    expect(normalizeKenyanPhoneNumber("254111222333")).toBe("254111222333");
    expect(normalizeKenyanPhoneNumber("712345678")).toBe("254712345678");
  });

  it("rejects invalid phone formats cleanly", () => {
    expect(() => normalizeKenyanPhoneNumber("0201234567")).toThrow();
    expect(() => normalizeKenyanPhoneNumber("12345")).toThrow();
    expect(() => normalizeKenyanPhoneNumber("+14155551234")).toThrow();
    expect(() => normalizeKenyanPhoneNumber("")).toThrow();
  });

  it("formats WhatsApp numbers consistently", () => {
    expect(normalizeWhatsAppNumber("0712 345 678")).toBe("254712345678");
    expect(formatWhatsAppNumber("0712345678")).toBe("+254 712 345 678");
    expect(normalizeWhatsAppNumber("000")).toBeNull();
  });
});

describe("Phase 15 unit tests: delivery fee, discount rules, and totals", () => {
  it("applies delivery zone fee below free-delivery threshold and computes remaining gap", () => {
    const totals = calculateCheckoutTotals({
      subtotal: 4500,
      zoneFee: 350,
      freeDeliveryThreshold: 8000
    });
    expect(totals.deliveryFee).toBe(350);
    expect(totals.freeDeliveryUnlocked).toBe(false);
    expect(totals.amountToFreeDelivery).toBe(3500);
    expect(totals.total).toBe(4850);
  });

  it("unlocks free delivery at or above threshold or via free-delivery promo code", () => {
    const atThreshold = calculateCheckoutTotals({
      subtotal: 8000,
      zoneFee: 450,
      freeDeliveryThreshold: 8000
    });
    expect(atThreshold.deliveryFee).toBe(0);
    expect(atThreshold.freeDeliveryUnlocked).toBe(true);
    expect(atThreshold.amountToFreeDelivery).toBe(0);
    expect(atThreshold.total).toBe(8000);

    const viaCode = calculateCheckoutTotals({
      subtotal: 2500,
      zoneFee: 450,
      freeDeliveryThreshold: 8000,
      freeDeliveryFromCode: true
    });
    expect(viaCode.deliveryFee).toBe(0);
    expect(viaCode.freeDeliveryUnlocked).toBe(true);
    expect(viaCode.total).toBe(2500);
  });

  it("clamps discount amounts so order subtotal never goes negative", () => {
    const totals = calculateCheckoutTotals({
      subtotal: 3000,
      zoneFee: 300,
      freeDeliveryThreshold: 10000,
      discountAmount: 9999
    });
    expect(totals.discountAmount).toBe(3000);
    expect(totals.total).toBe(300);
  });

  it("validates discount code payloads, sale pricing, and lifecycle states", () => {
    expect(normalizeDiscountCode("  nairobi 10 ")).toBe("NAIROBI10");
    expect(isProductOnSale({ price: 2500, compare_at_price: 3500 })).toBe(true);
    expect(isProductOnSale({ price: 2500, compare_at_price: 2500 })).toBe(false);
    expect(getSaleSavingsPercent({ price: 2500, compare_at_price: 5000 })).toBe(50);

    expect(formatDiscountValueLabel("percent", 15)).toBe("15% off");
    expect(formatDiscountValueLabel("fixed", 500)).toBe("KES 500 off");
    expect(formatDiscountValueLabel("free_delivery", 0)).toBe("Free delivery");

    const now = Date.parse("2026-11-26T12:00:00Z");
    expect(
      getDiscountLifecycleStatus(
        {
          active: true,
          starts_at: "2026-11-27T00:00:00Z",
          ends_at: null,
          usage_limit: null,
          used_count: 0
        },
        now
      )
    ).toBe("scheduled");
    expect(
      getDiscountLifecycleStatus(
        {
          active: true,
          starts_at: null,
          ends_at: "2026-11-25T00:00:00Z",
          usage_limit: null,
          used_count: 0
        },
        now
      )
    ).toBe("expired");
    expect(
      getDiscountLifecycleStatus(
        {
          active: true,
          starts_at: null,
          ends_at: null,
          usage_limit: 5,
          used_count: 5
        },
        now
      )
    ).toBe("exhausted");

    expect(
      discountCodePayloadSchema.safeParse({
        code: "OVER100",
        description: null,
        type: "percent",
        value: 120,
        min_order_amount: 0,
        starts_at: null,
        ends_at: null,
        usage_limit: null,
        per_phone_limit: null
      }).success
    ).toBe(false);

    expect(
      discountCodePayloadSchema.safeParse({
        code: "BADDATES",
        description: null,
        type: "fixed",
        value: 500,
        min_order_amount: 2000,
        starts_at: "2026-12-10T00:00:00Z",
        ends_at: "2026-12-01T00:00:00Z",
        usage_limit: 50,
        per_phone_limit: 1
      }).success
    ).toBe(false);
  });
});

describe("Phase 15 unit tests: order, invoice, and credit-note numbering & money helpers", () => {
  it("formats human-readable order numbers and enforces KES formatting", () => {
    expect(
      formatOrderDisplayNumber({ id: "12345678-aaaa-bbbb-cccc-1234567890ab", order_number: "AA-7F3K2" })
    ).toBe("AA-7F3K2");
    expect(
      formatOrderDisplayNumber({ id: "12345678-aaaa-bbbb-cccc-1234567890ab", order_number: null })
    ).toBe("#12345678");
    expect(formatCurrency(4500)).toBe("KES 4,500");
    expect(formatCurrency(4500)).not.toContain("Ksh");
  });

  it("validates canonical invoice/credit-note numbering patterns and document titles", () => {
    expect(/^INV-\d{4}-\d{4,}$/.test("INV-2026-0001")).toBe(true);
    expect(/^CN-\d{4}-\d{4,}$/.test("CN-2026-0001")).toBe(true);
    expect(/^AA-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/.test("AA-7F3K2")).toBe(true);

    // Strictly Invoice or Receipt — never Tax Invoice
    expect(getInvoiceDocumentTitle({ status: "unpaid" })).toBe("Invoice");
    expect(getInvoiceDocumentTitle({ status: "partially_paid" })).toBe("Invoice");
    expect(getInvoiceDocumentTitle({ status: "paid" })).toBe("Receipt");

    expect(
      computeInvoiceBalanceDue({ total: 6500, credited_amount: 1500, amount_paid: 2000 })
    ).toBe(3000);
    expect(
      computeInvoiceBalanceDue({ total: 5000, credited_amount: 3000, amount_paid: 3000 })
    ).toBe(0);

    expect(normalizeMpesaCode(" shk4 p9x2 m1 ")).toBe("SHK4P9X2M1");
    expect(isValidMpesaCode("SHK4P9X2M1")).toBe(true);
    expect(isValidMpesaCode("BAD")).toBe(false);
  });
});

describe("Phase 15 unit tests: WhatsApp checkout message builder", () => {
  it("builds properly encoded wa.me URLs with KES totals and pay-on-delivery text", () => {
    const { message, url } = buildWhatsAppCheckoutUrl("0712 345 678", {
      orderNumber: "AA-8M4P2",
      items: [
        { title: "Solstice Gold Cuff", quantity: 1, lineTotal: 4500 },
        { title: "Nairobi Chrono Watch", quantity: 2, lineTotal: 12000 }
      ],
      subtotal: 16500,
      discountCode: "WELCOME10",
      discountAmount: 1650,
      deliveryZoneName: "Westlands",
      deliveryFee: 0,
      total: 14850,
      customerName: "Amina Wanjiku",
      customerPhone: "254712345678",
      deliveryAddress: "Sarit Centre, 3rd floor",
      isGift: true,
      giftNote: "Happy birthday!"
    });

    expect(url).toMatch(/^https:\/\/wa\.me\/254712345678\?text=/);
    expect(url!.length).toBeLessThanOrEqual(MAX_WHATSAPP_URL_LENGTH);
    expect(message).toContain("AA-8M4P2");
    expect(message).toContain("KES 14,850");
    expect(message).toContain("Payment: Cash / M-Pesa on delivery");
    expect(message).toContain('Gift: Yes — "Happy birthday!"');

    // Decoding the URL query parameter must match the raw message identically
    const encodedBody = url!.split("?text=")[1] ?? "";
    expect(decodeURIComponent(encodedBody)).toBe(message);
  });

  it("caps long item lists under MAX_WHATSAPP_URL_LENGTH with +N more items summary", () => {
    const manyItems = Array.from({ length: 30 }, (_, index) => ({
      title: `Handcrafted Sculptural Gold Necklace Edition ${index + 1}`,
      quantity: 1,
      lineTotal: 3500
    }));

    const { message, url } = buildWhatsAppCheckoutUrl("+254 700 123 456", {
      orderNumber: "AA-9Z8X7",
      items: manyItems,
      subtotal: 105000,
      deliveryZoneName: "Kilimani",
      deliveryFee: 0,
      total: 105000,
      customerName: "Grace Muthoni",
      customerPhone: "254700123456",
      deliveryAddress: "Yaya Centre Wing B"
    });

    expect(url).not.toBeNull();
    expect(url!.length).toBeLessThanOrEqual(MAX_WHATSAPP_URL_LENGTH);
    expect(message).toContain("more items (see order AA-9Z8X7)");
  });
});

describe("Phase 15 unit tests: order status transition rules", () => {
  it("enforces strict forward-only canonical lifecycle transitions", () => {
    expect(getNextValidCanonicalStatuses("pending")).toEqual(["confirmed"]);
    expect(getNextValidCanonicalStatuses("confirmed")).toEqual(["dispatched"]);
    expect(getNextValidCanonicalStatuses("dispatched")).toEqual(["delivered"]);
    expect(getNextValidCanonicalStatuses("delivered")).toEqual([]);
    expect(getNextValidCanonicalStatuses("cancelled")).toEqual([]);
    expect(getNextValidCanonicalStatuses("returned")).toEqual([]);
  });

  it("allows cancel only before delivery and return only after delivery", () => {
    expect(canCancelOrderStatus("pending")).toBe(true);
    expect(canCancelOrderStatus("confirmed")).toBe(true);
    expect(canCancelOrderStatus("dispatched")).toBe(true);
    expect(canCancelOrderStatus("delivered")).toBe(false);
    expect(canCancelOrderStatus("cancelled")).toBe(false);
    expect(canCancelOrderStatus("returned")).toBe(false);

    expect(canReturnOrderStatus("delivered")).toBe(true);
    expect(canReturnOrderStatus("returned")).toBe(true);
    expect(canReturnOrderStatus("pending")).toBe(false);
    expect(canReturnOrderStatus("confirmed")).toBe(false);
    expect(canReturnOrderStatus("cancelled")).toBe(false);
  });

  it("validates legacy transitions and 24h overdue detection", () => {
    expect(isValidOrderStatusTransition("PENDING_CONFIRMATION", "CONFIRMED")).toBe(true);
    expect(isValidOrderStatusTransition("DELIVERED", "CANCELLED")).toBe(false);
    expect(isValidOrderStatusTransition("CANCELLED", "CONFIRMED")).toBe(false);

    expect(
      resolveCanonicalOrderStatus({ status: null, order_status: "OUT_FOR_DELIVERY" })
    ).toBe("dispatched");

    const nowMs = Date.parse("2026-11-26T12:00:00Z");
    expect(
      isPendingOrderOverdue24h(
        {
          status: "pending",
          order_status: "PENDING_CONFIRMATION",
          created_at: "2026-11-25T11:00:00Z"
        },
        nowMs
      )
    ).toBe(true);
    expect(
      isPendingOrderOverdue24h(
        {
          status: "confirmed",
          order_status: "CONFIRMED",
          created_at: "2026-11-24T00:00:00Z"
        },
        nowMs
      )
    ).toBe(false);
  });
});

describe("Phase 15 unit tests: Sentry PII scrubbing and structured log redaction", () => {
  it("scrubs Kenyan phone numbers, emails, addresses, names, cookies, and query strings from Sentry events", () => {
    expect(
      scrubPiiString("Order failed for +254 712 345 678 / 0722111222 / amina@example.com")
    ).toBe("Order failed for [REDACTED_PHONE] / [REDACTED_PHONE] / [REDACTED_EMAIL]");

    const dirtyEvent: ErrorEvent = {
      type: undefined,
      message: "Checkout error for 0712345678",
      user: {
        id: "user-123",
        email: "amina@example.com",
        ip_address: "41.89.10.22",
        username: "Amina"
      },
      request: {
        url: "https://aura-ardon.vercel.app/order/AA-12345?t=secret-token&phone=0712345678",
        query_string: "t=secret-token&phone=0712345678",
        cookies: { sb_access_token: "jwt" },
        headers: {
          cookie: "session=abc",
          authorization: "Bearer xyz",
          "x-forwarded-for": "41.89.10.22",
          "user-agent": "Chrome"
        },
        data: {
          customer_name: "Amina Wanjiku",
          phone: "+254712345678",
          delivery_address: "Sarit Centre 3rd floor",
          orderNumber: "AA-12345"
        }
      },
      extra: {
        landmark: "Opposite Westgate",
        orderNumber: "AA-12345"
      },
      exception: {
        values: [
          {
            type: "Error",
            value: "Failed to send SMS to +254712345678 (amina@example.com)"
          }
        ]
      }
    };

    const clean = scrubSentryEvent(dirtyEvent);
    expect(clean).not.toBeNull();
    const serialized = JSON.stringify(clean);

    expect(serialized).not.toContain("0712345678");
    expect(serialized).not.toContain("254712345678");
    expect(serialized).not.toContain("amina@example.com");
    expect(serialized).not.toContain("Amina Wanjiku");
    expect(serialized).not.toContain("Sarit Centre");
    expect(serialized).not.toContain("Opposite Westgate");
    expect(serialized).not.toContain("41.89.10.22");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("Bearer xyz");
    expect(serialized).toContain("AA-12345");
    expect(clean?.user).toEqual({ id: "user-123" });
    expect(clean?.request?.url).toBe("https://aura-ardon.vercel.app/order/AA-12345");
    expect(scrubPiiDeep({ nested: { gift_note: "Happy birthday", ok: 1 } })).toEqual({
      nested: { gift_note: "[REDACTED]", ok: 1 }
    });
  });

  it("redacts personal fields and Kenyan phone numbers from structured logs", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      logger.info("order.placed", {
        orderNumber: "AA-55555",
        customer_phone: "0712345678",
        delivery_address: "Kilimani Road",
        note: "Call +254722111222 on arrival"
      });

      expect(spy).toHaveBeenCalledTimes(1);
      const output = String(spy.mock.calls[0]?.[0] ?? "");
      expect(output).toContain("AA-55555");
      expect(output).not.toContain("0712345678");
      expect(output).not.toContain("Kilimani Road");
      expect(output).not.toContain("254722111222");
      expect(output).toContain("[REDACTED]");
      expect(output).toContain("[REDACTED_PHONE]");
    } finally {
      spy.mockRestore();
    }
  });
});

