import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimitBuckets } from "@/lib/rate-limit";

const rpcSingle = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn()
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

function buildRequest(idempotencyKey: string, ip = "198.51.100.24") {
  return new Request("https://example.test/api/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
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
      notes: null,
      paymentMethod: "CASH_ON_DELIVERY"
    })
  });
}

describe("checkout stress scenarios", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetRateLimitBuckets();
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "254700123456";
    process.env.ORDER_STATUS_TOKEN_SECRET = "test-order-status-secret";
  });

  it("allows only available stock when 100 users order the same item", async () => {
    let stock = 20;
    let sequence = 0;

    rpcSingle.mockImplementation(async () => {
      if (stock <= 0) {
        return {
          data: null,
          error: { message: "One or more items are not available in the requested quantity." }
        };
      }

      stock -= 1;
      sequence += 1;

      return {
        data: {
          order_id: `00000000-0000-0000-0000-${String(sequence).padStart(12, "0")}`,
          subtotal: "1200.00",
          shipping_fee: "0.00",
          total: "1200.00",
          payment_method: "CASH_ON_DELIVERY",
          payment_status: "PENDING",
          order_status: "PENDING_CONFIRMATION",
          replayed: false,
          item_summary: [{ title: "Bracelet", quantity: 1 }]
        },
        error: null
      };
    });

    const { POST } = await loadRoute();
    const responses = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        POST(buildRequest(`checkout-${index}`, `198.51.100.${index + 1}`))
      )
    );

    const statuses = await Promise.all(responses.map(response => response.status));
    const successCount = statuses.filter(status => status === 201).length;
    const conflictCount = statuses.filter(status => status === 409).length;

    expect(successCount).toBe(20);
    expect(conflictCount).toBe(80);
  });

  it("returns the existing order for duplicate requests with the same idempotency key", async () => {
    const orders = new Map<string, { id: string; replayed: boolean }>();

    rpcSingle.mockImplementation(async () => {
      const order = orders.get("duplicate-key");

      if (order) {
        return {
          data: {
            order_id: order.id,
            subtotal: "1200.00",
            shipping_fee: "0.00",
            total: "1200.00",
            payment_method: "CASH_ON_DELIVERY",
            payment_status: "PENDING",
            order_status: "PENDING_CONFIRMATION",
            replayed: true,
            item_summary: [{ title: "Bracelet", quantity: 1 }]
          },
          error: null
        };
      }

      orders.set("duplicate-key", {
        id: "00000000-0000-0000-0000-000000000001",
        replayed: false
      });

      return {
        data: {
          order_id: "00000000-0000-0000-0000-000000000001",
          subtotal: "1200.00",
          shipping_fee: "0.00",
          total: "1200.00",
          payment_method: "CASH_ON_DELIVERY",
          payment_status: "PENDING",
          order_status: "PENDING_CONFIRMATION",
          replayed: false,
          item_summary: [{ title: "Bracelet", quantity: 1 }]
        },
        error: null
      };
    });

    const { POST } = await loadRoute();
    const [firstResponse, secondResponse] = await Promise.all([
      POST(buildRequest("duplicate-key", "198.51.100.50")),
      POST(buildRequest("duplicate-key", "198.51.100.51"))
    ]);

    const firstJson = await firstResponse.json();
    const secondJson = await secondResponse.json();

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(200);
    expect(firstJson.orderId).toBe(secondJson.orderId);
    expect(secondJson.replayed).toBe(true);
  });
});
