import { beforeEach, describe, expect, it, vi } from "vitest";

const assertAdminRequest = vi.fn();
const revalidateProductCatalog = vi.fn();
const rpcSingle = vi.fn();

vi.mock("@/lib/auth", () => ({ assertAdminRequest }));
vi.mock("@/lib/cache", () => ({ revalidateProductCatalog }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: (_fn: string, params: unknown) => ({
      single: () => rpcSingle(params)
    })
  })
}));

describe("PATCH /api/admin/orders/[id]", () => {
  const orderId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    assertAdminRequest.mockResolvedValue({ email: "admin@example.com" });
  });

  it("updates paymentStatus to PAID via atomic RPC", async () => {
    rpcSingle.mockResolvedValueOnce({
      data: {
        id: orderId,
        order_status: "DELIVERED",
        payment_status: "PAID"
      },
      error: null
    });

    const { PATCH } = await import("@/app/api/admin/orders/[id]/route");
    const response = await PATCH(
      new Request(`https://example.test/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentStatus: "PAID" })
      }),
      { params: Promise.resolve({ id: orderId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.order.payment_status).toBe("PAID");
    expect(rpcSingle).toHaveBeenCalledWith({
      target_order_id: orderId,
      next_order_status: null,
      next_payment_status: "PAID"
    });
  });

  it("revalidates product catalog when cancelling an order (restoring stock)", async () => {
    rpcSingle.mockResolvedValueOnce({
      data: {
        id: orderId,
        order_status: "CANCELLED",
        payment_status: "PENDING"
      },
      error: null
    });

    const { PATCH } = await import("@/app/api/admin/orders/[id]/route");
    const response = await PATCH(
      new Request(`https://example.test/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" })
      }),
      { params: Promise.resolve({ id: orderId }) }
    );

    expect(response.status).toBe(200);
    expect(revalidateProductCatalog).toHaveBeenCalledOnce();
  });

  it("returns 409 on invalid status transition and 400 on malformed UUID", async () => {
    rpcSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid status transition." }
    });

    const { PATCH } = await import("@/app/api/admin/orders/[id]/route");

    const invalidIdResponse = await PATCH(
      new Request("https://example.test/api/admin/orders/not-a-uuid", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" })
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    expect(invalidIdResponse.status).toBe(400);

    const conflictResponse = await PATCH(
      new Request(`https://example.test/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" })
      }),
      { params: Promise.resolve({ id: orderId }) }
    );
    expect(conflictResponse.status).toBe(409);
  });
});

