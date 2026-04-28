import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimitBuckets } from "@/lib/rate-limit";

const loggerError = vi.fn();
const rpcSingle = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerError
  }
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: () => ({
      single: rpcSingle
    })
  })
}));

async function loadRoute() {
  return import("@/app/api/checkout/route");
}

function createCheckoutRequest(idempotencyKey: string, body?: Record<string, unknown>) {
  return new Request("https://example.test/api/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(
      body ?? {
        items: [
          {
            productId: "11111111-1111-1111-1111-111111111111",
            quantity: 1
          }
        ],
        customerName: "Auro",
        customerEmail: "auro@example.com",
        customerPhone: "0712345678",
        customerLocation: "Nairobi",
        notes: "Leave at gate",
        paymentMethod: "WHATSAPP"
      }
    )
  });
}

describe("POST /api/checkout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetRateLimitBuckets();
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "254700123456";
    process.env.ORDER_STATUS_TOKEN_SECRET = "test-order-status-secret";
  });

  afterEach(() => {
    resetRateLimitBuckets();
  });

  it("completes the full checkout flow and returns the WhatsApp link", async () => {
    rpcSingle.mockResolvedValueOnce({
      data: {
        order_id: "b5b7cba1-2ccb-4cb5-83e7-1ce1ef4f0f43",
        subtotal: "3500.00",
        shipping_fee: "0.00",
        total: "3500.00",
        payment_method: "WHATSAPP",
        payment_status: "PENDING",
        order_status: "PENDING_CONFIRMATION",
        replayed: false,
        item_summary: [
          { title: "Bracelet", quantity: 2 },
          { title: "Earrings", quantity: 1 }
        ]
      },
      error: null
    });

    const { POST } = await loadRoute();
    const response = await POST(createCheckoutRequest("checkout-key-1"));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.replayed).toBe(false);
    expect(json.orderId).toBe("b5b7cba1-2ccb-4cb5-83e7-1ce1ef4f0f43");
    expect(json.whatsappUrl).toContain("https://wa.me/254700123456?text=");
    expect(decodeURIComponent(json.whatsappUrl)).toContain("Bracelet x2, Earrings x1");
    expect(json.orderStatusToken).toContain("b5b7cba1-2ccb-4cb5-83e7-1ce1ef4f0f43.");
  });

  it("rejects an empty cart before the database is called", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      createCheckoutRequest("checkout-key-empty", {
        items: [],
        customerName: "Auro",
        customerEmail: "auro@example.com",
        customerPhone: "0712345678",
        customerLocation: "Nairobi",
        notes: null,
        paymentMethod: "WHATSAPP"
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Your cart is empty.");
    expect(rpcSingle).not.toHaveBeenCalled();
  });
});
