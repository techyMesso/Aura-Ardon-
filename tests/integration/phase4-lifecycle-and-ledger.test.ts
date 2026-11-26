import { beforeEach, describe, expect, it, vi } from "vitest";

const assertAdminRequest = vi.fn();
const revalidateProductCatalog = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();
const getOrderDetailBundleMock = vi.fn();
const listProductStockMovementsMock = vi.fn();
const runStockIntegrityCheckMock = vi.fn();

vi.mock("@/lib/auth", () => ({ assertAdminRequest }));
vi.mock("@/lib/cache", () => ({ revalidateProductCatalog }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}));
vi.mock("@/lib/data", () => ({
  getOrderDetailBundle: (...args: unknown[]) => getOrderDetailBundleMock(...args),
  listProductStockMovements: (...args: unknown[]) => listProductStockMovementsMock(...args),
  runStockIntegrityCheck: (...args: unknown[]) => runStockIntegrityCheckMock(...args)
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: (fn: string, params?: unknown) => ({
      single: () => rpcMock(fn, params)
    }),
    from: (table: string) => fromMock(table)
  })
}));

const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const PRODUCT_ID = "44444444-4444-4444-8444-444444444444";

describe("Phase 4 lifecycle, returns, stock ledger, and auto-cancel cron routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertAdminRequest.mockResolvedValue({
      id: "admin-1",
      email: "aura.ardoncompany@gmail.com"
    });
    getOrderDetailBundleMock.mockResolvedValue({
      order: {
        id: ORDER_ID,
        order_number: "AA-7F3K2",
        status: "confirmed",
        order_status: "CONFIRMED",
        payment_status: "PENDING"
      },
      items: [],
      history: [],
      returns: []
    });
  });

  it("blocks DELETE /api/admin/orders/[id] with HTTP 405", async () => {
    const { DELETE } = await import("@/app/api/admin/orders/[id]/route");
    const response = await DELETE();
    const json = await response.json();

    expect(response.status).toBe(405);
    expect(json.error).toMatch(/Orders cannot be deleted/i);
  });

  it("advances valid status via set_order_status and rejects invalid skips with 409", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: ORDER_ID, status: "confirmed" },
      error: null
    });

    const { POST } = await import("@/app/api/admin/orders/[id]/status/route");
    const okRes = await POST(
      new Request(`https://example.test/api/admin/orders/${ORDER_ID}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "confirmed" })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    expect(okRes.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("set_order_status", {
      p_order_id: ORDER_ID,
      p_to_status: "confirmed",
      p_changed_by: "aura.ardoncompany@gmail.com",
      p_reason: null
    });

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid status transition from pending to delivered." }
    });
    const skipRes = await POST(
      new Request(`https://example.test/api/admin/orders/${ORDER_ID}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "delivered" })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    expect(skipRes.status).toBe(409);
  });

  it("cancels an order idempotently with required reason and restocks once", async () => {
    const { POST } = await import("@/app/api/admin/orders/[id]/cancel/route");

    // Missing reason -> 400
    const badRes = await POST(
      new Request(`https://example.test/api/admin/orders/${ORDER_ID}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    expect(badRes.status).toBe(400);

    // First cancel restocks 2 items
    rpcMock.mockResolvedValueOnce({
      data: {
        order_id: ORDER_ID,
        order_number: "AA-7F3K2",
        status: "cancelled",
        restocked_items_count: 2,
        already_restocked: false
      },
      error: null
    });
    const firstRes = await POST(
      new Request(`https://example.test/api/admin/orders/${ORDER_ID}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "customer_cancelled", note: "Changed mind" })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    const firstJson = await firstRes.json();
    expect(firstRes.status).toBe(200);
    expect(firstJson.restockedItemsCount).toBe(2);
    expect(firstJson.alreadyRestocked).toBe(false);
    expect(revalidateProductCatalog).toHaveBeenCalledTimes(1);

    // Replay cancel is idempotent (alreadyRestocked=true, 0 restocked)
    rpcMock.mockResolvedValueOnce({
      data: {
        order_id: ORDER_ID,
        order_number: "AA-7F3K2",
        status: "cancelled",
        restocked_items_count: 0,
        already_restocked: true
      },
      error: null
    });
    const secondRes = await POST(
      new Request(`https://example.test/api/admin/orders/${ORDER_ID}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "customer_cancelled" })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    const secondJson = await secondRes.json();
    expect(secondRes.status).toBe(200);
    expect(secondJson.alreadyRestocked).toBe(true);
    expect(secondJson.restockedItemsCount).toBe(0);
    expect(revalidateProductCatalog).toHaveBeenCalledTimes(1);
  });

  it("handles resellable restock and damaged write-off returns", async () => {
    const { POST } = await import("@/app/api/admin/orders/[id]/return/route");

    rpcMock.mockResolvedValueOnce({
      data: {
        order_id: ORDER_ID,
        order_number: "AA-7F3K2",
        status: "returned",
        returned_units: 1,
        restocked_units: 1,
        returned_amount: 1850
      },
      error: null
    });
    const resellableRes = await POST(
      new Request(`https://example.test/api/admin/orders/${ORDER_ID}/return`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [{ orderItemId: ITEM_ID, quantity: 1 }],
          condition: "resellable",
          note: "Wrong size"
        })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    const resellableJson = await resellableRes.json();
    expect(resellableRes.status).toBe(200);
    expect(resellableJson.restockedUnits).toBe(1);
    expect(revalidateProductCatalog).toHaveBeenCalledTimes(1);

    rpcMock.mockResolvedValueOnce({
      data: {
        order_id: ORDER_ID,
        order_number: "AA-7F3K2",
        status: "returned",
        returned_units: 1,
        restocked_units: 0,
        returned_amount: 1850
      },
      error: null
    });
    const damagedRes = await POST(
      new Request(`https://example.test/api/admin/orders/${ORDER_ID}/return`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [{ orderItemId: ITEM_ID, quantity: 1 }],
          condition: "damaged",
          note: "Scratched dial"
        })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    const damagedJson = await damagedRes.json();
    expect(damagedRes.status).toBe(200);
    expect(damagedJson.restockedUnits).toBe(0);
    // Damaged return did not restock, so catalog revalidation count stays 1
    expect(revalidateProductCatalog).toHaveBeenCalledTimes(1);
  });

  it("enforces required note on manual stock adjustments and blocks direct stock edits", async () => {
    const { POST } = await import("@/app/api/admin/products/[id]/stock/route");

    const missingNoteRes = await POST(
      new Request(`https://example.test/api/admin/products/${PRODUCT_ID}/stock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ change: 3, note: " " })
      }),
      { params: Promise.resolve({ id: PRODUCT_ID }) }
    );
    expect(missingNoteRes.status).toBe(400);

    rpcMock.mockResolvedValueOnce({
      data: { product_id: PRODUCT_ID, new_stock_quantity: 8, movement_id: "mov-1" },
      error: null
    });
    listProductStockMovementsMock.mockResolvedValueOnce({
      product: { id: PRODUCT_ID, title: "Watch", stock_quantity: 8 },
      movements: [],
      ledgerSum: 8,
      isConsistent: true
    });
    const okRes = await POST(
      new Request(`https://example.test/api/admin/products/${PRODUCT_ID}/stock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ change: 3, note: "Restock shipment", type: "manual_adjustment" })
      }),
      { params: Promise.resolve({ id: PRODUCT_ID }) }
    );
    expect(okRes.status).toBe(200);
    expect(revalidateProductCatalog).toHaveBeenCalledTimes(1);

    // Direct PATCH of stock_quantity must fail with 400
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { slug: "watch", stock_quantity: 8 },
            error: null
          })
        })
      })
    });
    const { PATCH } = await import("@/app/api/admin/products/[id]/route");
    const directEditRes = await PATCH(
      new Request(`https://example.test/api/admin/products/${PRODUCT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stock_quantity: 99 })
      }),
      { params: Promise.resolve({ id: PRODUCT_ID }) }
    );
    const directJson = await directEditRes.json();
    expect(directEditRes.status).toBe(400);
    expect(directJson.error).toMatch(/Stock cannot be overwritten directly/i);
  });

  it("exposes admin stock integrity check and protects auto-cancel cron with CRON_SECRET", async () => {
    runStockIntegrityCheckMock.mockResolvedValueOnce({
      ok: true,
      totalProducts: 8,
      discrepancies: [],
      checkedAt: "2026-06-10T10:00:00.000Z"
    });
    const { GET: integrityGet } = await import("@/app/api/admin/stock/integrity/route");
    const intRes = await integrityGet();
    const intJson = await intRes.json();
    expect(intRes.status).toBe(200);
    expect(intJson.ok).toBe(true);
    expect(intJson.discrepancies).toEqual([]);

    // Cron secret enforcement
    process.env.CRON_SECRET = "super-secret-cron-token-1234";
    const { GET: cronGet } = await import("@/app/api/cron/auto-cancel-pending/route");

    const unauthRes = await cronGet(
      new Request("https://aura-ardon.vercel.app/api/cron/auto-cancel-pending", {
        headers: { authorization: "Bearer wrong-token" }
      })
    );
    expect(unauthRes.status).toBe(401);

    rpcMock.mockResolvedValueOnce({
      data: {
        cancelled_count: 2,
        restocked_units: 3,
        cancelled_order_numbers: ["AA-11111", "AA-22222"]
      },
      error: null
    });
    const authRes = await cronGet(
      new Request("https://aura-ardon.vercel.app/api/cron/auto-cancel-pending", {
        headers: { authorization: "Bearer super-secret-cron-token-1234" }
      })
    );
    const authJson = await authRes.json();
    expect(authRes.status).toBe(200);
    expect(authJson.cancelledCount).toBe(2);
    expect(authJson.restockedUnits).toBe(3);
    expect(revalidateProductCatalog).toHaveBeenCalledTimes(1);
  });
});

