import { describe, expect, it } from "vitest";

import { productCreateSchema } from "@/lib/admin-product-input";
import {
  discountCodePayloadSchema,
  formatDiscountValueLabel,
  getDiscountLifecycleStatus,
  getSaleSavingsPercent,
  isProductOnSale,
  normalizeDiscountCode
} from "@/lib/discounts";
import {
  buildWhatsAppCheckoutUrl,
  calculateCheckoutTotals
} from "@/lib/whatsapp-order";

describe("Phase 6 discounts, free delivery, and sale pricing helpers", () => {
  it("normalizes codes and validates discount payload schemas", () => {
    expect(normalizeDiscountCode("  welcome10  ")).toBe("WELCOME10");
    expect(formatDiscountValueLabel("percent", 15)).toBe("15% off");
    expect(formatDiscountValueLabel("fixed", 500)).toBe("KES 500 off");
    expect(formatDiscountValueLabel("free_delivery", 0)).toBe("Free delivery");

    expect(
      discountCodePayloadSchema.safeParse({
        code: "badpercent",
        description: null,
        type: "percent",
        value: 120,
        min_order_amount: 0,
        starts_at: null,
        ends_at: null,
        usage_limit: null,
        per_phone_limit: null,
        first_order_only: false,
        active: true
      }).success
    ).toBe(false);

    expect(
      discountCodePayloadSchema.safeParse({
        code: "baddates",
        description: null,
        type: "fixed",
        value: 200,
        min_order_amount: 0,
        starts_at: "2026-06-10T10:00:00+03:00",
        ends_at: "2026-06-01T10:00:00+03:00",
        usage_limit: null,
        per_phone_limit: null,
        first_order_only: false,
        active: true
      }).success
    ).toBe(false);

    const valid = discountCodePayloadSchema.parse({
      code: "nairobifree",
      description: "Free delivery weekend",
      type: "free_delivery",
      value: 0,
      min_order_amount: 1000,
      starts_at: null,
      ends_at: null,
      usage_limit: 50,
      per_phone_limit: 1,
      first_order_only: true,
      active: true
    });
    expect(valid.code).toBe("NAIROBIFREE");
  });

  it("derives lifecycle status from active flag, dates, and usage limits", () => {
    const now = Date.parse("2026-06-15T12:00:00.000Z");
    expect(
      getDiscountLifecycleStatus(
        { active: false, starts_at: null, ends_at: null, usage_limit: null, used_count: 0 },
        now
      )
    ).toBe("inactive");
    expect(
      getDiscountLifecycleStatus(
        {
          active: true,
          starts_at: "2026-07-01T00:00:00.000Z",
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
          ends_at: "2026-06-01T00:00:00.000Z",
          usage_limit: null,
          used_count: 0
        },
        now
      )
    ).toBe("expired");
    expect(
      getDiscountLifecycleStatus(
        { active: true, starts_at: null, ends_at: null, usage_limit: 5, used_count: 5 },
        now
      )
    ).toBe("exhausted");
    expect(
      getDiscountLifecycleStatus(
        { active: true, starts_at: null, ends_at: null, usage_limit: 5, used_count: 2 },
        now
      )
    ).toBe("active");
  });

  it("enforces compare_at_price > price for sale pricing", () => {
    expect(isProductOnSale({ price: "1800", compare_at_price: "2400" })).toBe(true);
    expect(getSaleSavingsPercent({ price: "1800", compare_at_price: "2400" })).toBe(25);
    expect(isProductOnSale({ price: "1800", compare_at_price: "1800" })).toBe(false);
    expect(isProductOnSale({ price: "1800", compare_at_price: "1500" })).toBe(false);
    expect(isProductOnSale({ price: "1800", compare_at_price: null })).toBe(false);

    const badProduct = productCreateSchema.safeParse({
      title: "Gold Ring",
      description: "A finely crafted gold-tone ring made for everyday shine.",
      price: 2500,
      compare_at_price: 2500,
      stock_quantity: 5,
      category_id: "11111111-1111-4111-8111-111111111111",
      material: "Stainless steel",
      images: ["https://example.test/ring.jpg"]
    });
    expect(badProduct.success).toBe(false);
  });

  it("computes free delivery from code or threshold and formats WhatsApp promo lines", () => {
    const totals = calculateCheckoutTotals({
      subtotal: 1800,
      zoneFee: 250,
      freeDeliveryThreshold: 3000,
      discountAmount: 0,
      freeDeliveryFromCode: true
    });
    expect(totals.freeDeliveryUnlocked).toBe(true);
    expect(totals.deliveryFee).toBe(0);
    expect(totals.total).toBe(1800);

    const { message } = buildWhatsAppCheckoutUrl("254718038825", {
      orderNumber: "AA-PROMO",
      items: [{ title: "Gold Cuff", quantity: 1, lineTotal: 1800 }],
      subtotal: 1800,
      discountCode: "FREESHIP",
      discountAmount: 0,
      deliveryZoneName: "Westlands",
      deliveryFee: 0,
      total: 1800,
      customerName: "Amina",
      customerPhone: "254712345678",
      deliveryAddress: "Sarit Centre"
    });
    expect(message).toContain("Promo (FREESHIP): Free delivery");
    expect(message).toContain("Delivery (Westlands): Free");
  });
});

