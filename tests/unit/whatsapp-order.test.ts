import { describe, expect, it } from "vitest";

import {
  createOrderNumberToken,
  verifyOrderNumberToken
} from "@/lib/order-status-token";
import {
  MAX_WHATSAPP_URL_LENGTH,
  buildWhatsAppCheckoutUrl,
  calculateCheckoutTotals
} from "@/lib/whatsapp-order";

describe("Phase 3 WhatsApp order totals, message builder, and signed tokens", () => {
  it("computes delivery fees, free-delivery progress, discounts, and totals accurately", () => {
    const underThreshold = calculateCheckoutTotals({
      subtotal: 1850,
      zoneFee: 200,
      freeDeliveryThreshold: 3000,
      discountAmount: 100
    });
    expect(underThreshold).toEqual({
      subtotal: 1850,
      discountAmount: 100,
      deliveryFee: 200,
      freeDeliveryUnlocked: false,
      amountToFreeDelivery: 1150,
      total: 1950
    });

    const freeDelivery = calculateCheckoutTotals({
      subtotal: 3200,
      zoneFee: 350,
      freeDeliveryThreshold: 3000,
      discountAmount: 0
    });
    expect(freeDelivery).toEqual({
      subtotal: 3200,
      discountAmount: 0,
      deliveryFee: 0,
      freeDeliveryUnlocked: true,
      amountToFreeDelivery: 0,
      total: 3200
    });
  });

  it("formats the exact WhatsApp checkout message with order number, lines, discount, delivery, and gift note", () => {
    const { message, url } = buildWhatsAppCheckoutUrl("254718038825", {
      orderNumber: "AA-7F3K2",
      items: [
        { title: "Men's Classic Fashion Watch", quantity: 1, lineTotal: 350 },
        { title: "Lip Collection", quantity: 2, lineTotal: 300 }
      ],
      subtotal: 650,
      discountCode: "WELCOME10",
      discountAmount: 65,
      deliveryZoneName: "Westlands",
      deliveryFee: 200,
      total: 785,
      customerName: "Amina Wanjiku",
      customerPhone: "254712345678",
      deliveryAddress: "Sarit Centre, 3rd floor",
      isGift: true,
      giftNote: "Happy birthday!",
      notes: "Call on arrival"
    });

    expect(url).not.toBeNull();
    expect(url!.startsWith("https://wa.me/254718038825?text=")).toBe(true);
    expect(url!.length).toBeLessThanOrEqual(MAX_WHATSAPP_URL_LENGTH);

    expect(message).toContain("Order: AA-7F3K2");
    expect(message).toContain("• Men's Classic Fashion Watch × 1 — KES 350");
    expect(message).toContain("• Lip Collection × 2 — KES 300");
    expect(message).toContain("Subtotal: KES 650");
    expect(message).toContain("Discount (WELCOME10): −KES 65");
    expect(message).toContain("Delivery (Westlands): KES 200");
    expect(message).toContain("Total: KES 785");
    expect(message).toContain("Payment: Cash / M-Pesa on delivery");
    expect(message).toContain("Address: Westlands — Sarit Centre, 3rd floor");
    expect(message).toContain('Gift: Yes — "Happy birthday!"');
    expect(message).toContain("Notes: Call on arrival");
  });

  it("keeps encoded wa.me URL under 1,800 characters for large carts by summarizing remaining items", () => {
    const largeCart = Array.from({ length: 28 }, (_, index) => ({
      title: `Sculpted Gold-Tone Statement Piece Edition ${index + 1}`,
      quantity: 1,
      lineTotal: 1500
    }));

    const { message, url } = buildWhatsAppCheckoutUrl("254718038825", {
      orderNumber: "AA-9K4M2",
      items: largeCart,
      subtotal: 42000,
      deliveryZoneName: "Kilimani",
      deliveryFee: 0,
      total: 42000,
      customerName: "Grace Njeri",
      customerPhone: "254712345678",
      deliveryAddress: "Yaya Centre Main Gate"
    });

    expect(url).not.toBeNull();
    expect(url!.length).toBeLessThanOrEqual(MAX_WHATSAPP_URL_LENGTH);
    expect(message).toMatch(/\+\d+ more items? \(see order AA-9K4M2\)/);
    expect(message).toContain("Delivery (Kilimani): Free");
  });

  it("signs and verifies unguessable order-number tokens bound to a single order", () => {
    const prevSecret = process.env.ORDER_STATUS_TOKEN_SECRET;
    process.env.ORDER_STATUS_TOKEN_SECRET = "phase3-test-secret-at-least-32-chars";
    try {
      const token = createOrderNumberToken("AA-7F3K2");
      expect(verifyOrderNumberToken(token, "AA-7F3K2")).toBe(true);
      expect(verifyOrderNumberToken(token, "aa-7f3k2")).toBe(true);
      expect(verifyOrderNumberToken(token, "AA-99999")).toBe(false);
      expect(verifyOrderNumberToken("tampered-token", "AA-7F3K2")).toBe(false);
      expect(verifyOrderNumberToken(null, "AA-7F3K2")).toBe(false);
    } finally {
      if (prevSecret === undefined) delete process.env.ORDER_STATUS_TOKEN_SECRET;
      else process.env.ORDER_STATUS_TOKEN_SECRET = prevSecret;
    }
  });
});

