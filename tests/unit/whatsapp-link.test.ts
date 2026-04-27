import { describe, expect, it } from "vitest";

import { createWhatsAppOrderUrl } from "@/lib/utils";

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
      ]
    });

    expect(url.startsWith("https://wa.me/254700123456?text=")).toBe(true);

    const parsed = new URL(url);
    const message = parsed.searchParams.get("text");

    expect(message).toContain("Hello, I placed order #1234.");
    expect(message).toContain("Customer: Auro");
    expect(message).toContain("Items: Bracelet x2, Earrings x1");
    expect(message).toContain("Total: KES 3500.00");
    expect(message).toContain("Delivery location: Nairobi CBD");
  });
});
