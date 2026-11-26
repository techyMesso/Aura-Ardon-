import { describe, expect, it } from "vitest";

import {
  createWhatsAppOrderUrl,
  normalizeKenyanPhoneNumber
} from "@/lib/utils";

describe("createWhatsAppOrderUrl", () => {
  it("builds an encoded wa.me URL with the order details", () => {
    const url = createWhatsAppOrderUrl({
      phoneNumber: "+254 700 123 456",
      orderId: "1234",
      customerName: "Auro",
      deliveryLocation: "Nairobi CBD",
      total: 3500,
      items: [
        { title: "Bracelet", quantity: 2 },
        { title: "Earrings", quantity: 1 }
      ],
      trackingUrl: "https://aura-ardon.vercel.app/orders/token-123"
    });

    expect(url).not.toBeNull();
    expect(url!.startsWith("https://wa.me/254700123456?text=")).toBe(true);

    const parsed = new URL(url!);
    const message = parsed.searchParams.get("text");

    expect(message).toContain("Hello, I placed order #1234.");
    expect(message).toContain("Customer: Auro");
    expect(message).toContain("Items: Bracelet x2, Earrings x1");
    expect(message).toContain("Total: KES 3500.00");
    expect(message).toContain("Delivery location: Nairobi CBD");
    expect(message).toContain("Track order: https://aura-ardon.vercel.app/orders/token-123");
  });
});

describe("normalizeKenyanPhoneNumber", () => {
  it("accepts Kenyan 07xx and 01xx formats including 9-digit local numbers", () => {
    expect(normalizeKenyanPhoneNumber("0712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhoneNumber("0112 345 678")).toBe("254112345678");
    expect(normalizeKenyanPhoneNumber("+254 112 345 678")).toBe("254112345678");
    expect(normalizeKenyanPhoneNumber("112345678")).toBe("254112345678");
    expect(normalizeKenyanPhoneNumber("712345678")).toBe("254712345678");
  });

  it("rejects malformed or non-mobile prefixes", () => {
    expect(() => normalizeKenyanPhoneNumber("0000000000")).toThrow();
    expect(() => normalizeKenyanPhoneNumber("12345")).toThrow();
  });
});
