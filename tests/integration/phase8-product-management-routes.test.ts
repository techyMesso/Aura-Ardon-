import { beforeEach, describe, expect, it, vi } from "vitest";

const assertAdminRequest = vi.fn();
const revalidateProductCatalog = vi.fn();
const fromMock = vi.fn();
const rpcSingleMock = vi.fn();
const listBackInStockAlertsMock = vi.fn();
const listProductStockMovementsMock = vi.fn();

vi.mock("@/lib/auth", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    assertAdminRequest
  };
});
vi.mock("@/lib/cache", () => ({ revalidateProductCatalog }));
vi.mock("@/lib/rate-limit", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({
      ok: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0
    })
  };
});
vi.mock("@/lib/data", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/data")>();
  return {
    ...actual,
    listBackInStockAlerts: (...args: unknown[]) => listBackInStockAlertsMock(...args),
    listProductStockMovements: (...args: unknown[]) =>
      listProductStockMovementsMock(...args)
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => fromMock(table),
    rpc: (fn: string, params: unknown) => ({
      single: () => rpcSingleMock(fn, params)
    })
  })
}));

const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const VARIANT_ID = "33333333-3333-4333-8333-333333333333";

describe("Phase 8 product management API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertAdminRequest.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      app_metadata: { role: "owner" }
    });
  });

  it("blocks hard-deleting an ordered product with 409 and archives it when archiveIfOrdered=1", async () => {
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: PRODUCT_ID, title: "Classic Watch", status: "archived", active: false },
      error: null
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "order_items") {
        return {
          select: () => ({
            eq: vi.fn().mockResolvedValue({ count: 3, error: null })
          })
        };
      }
      return {
        update: () => ({
          eq: () => ({
            select: () => ({ single: updateSingle })
          })
        })
      };
    });

    const { DELETE } = await import("@/app/api/admin/products/[id]/route");

    const blockedRes = await DELETE(
      new Request(`https://aura-ardon.vercel.app/api/admin/products/${PRODUCT_ID}`, {
        method: "DELETE"
      }),
      { params: Promise.resolve({ id: PRODUCT_ID }) }
    );
    const blockedJson = await blockedRes.json();
    expect(blockedRes.status).toBe(409);
    expect(blockedJson.hasOrders).toBe(true);

    const archiveRes = await DELETE(
      new Request(
        `https://aura-ardon.vercel.app/api/admin/products/${PRODUCT_ID}?archiveIfOrdered=1`,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: PRODUCT_ID }) }
    );
    const archiveJson = await archiveRes.json();
    expect(archiveRes.status).toBe(200);
    expect(archiveJson.archived).toBe(true);
  });

  it("forbids staff from modifying cost_price on PATCH /api/admin/products/[id]", async () => {
    assertAdminRequest.mockResolvedValueOnce({
      id: "staff-1",
      email: "staff@example.com",
      app_metadata: { role: "staff" }
    });

    fromMock.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              slug: "classic-watch",
              stock_quantity: 5,
              price: "4500.00",
              compare_at_price: null,
              status: "active"
            },
            error: null
          })
        })
      })
    });

    const { PATCH } = await import("@/app/api/admin/products/[id]/route");
    const res = await PATCH(
      new Request(`https://aura-ardon.vercel.app/api/admin/products/${PRODUCT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cost_price: 1500 })
      }),
      { params: Promise.resolve({ id: PRODUCT_ID }) }
    );

    expect(res.status).toBe(403);
  });

  it("adjusts variant stock through adjust_variant_stock ledger RPC and returns waiting alerts", async () => {
    rpcSingleMock.mockResolvedValueOnce({
      data: {
        variant_id: VARIANT_ID,
        product_id: PRODUCT_ID,
        new_variant_stock: 4,
        new_product_stock: 6,
        movement_id: "44444444-4444-4444-8444-444444444444"
      },
      error: null
    });
    listProductStockMovementsMock.mockResolvedValueOnce({
      movements: [],
      ledgerSum: 6
    });
    listBackInStockAlertsMock.mockResolvedValueOnce([
      {
        id: "55555555-5555-4555-8555-555555555555",
        product_id: PRODUCT_ID,
        variant_id: VARIANT_ID,
        phone: "254712345678",
        status: "waiting"
      }
    ]);

    const { POST } = await import(
      "@/app/api/admin/products/[id]/variants/[variantId]/stock/route"
    );
    const res = await POST(
      new Request(
        `https://aura-ardon.vercel.app/api/admin/products/${PRODUCT_ID}/variants/${VARIANT_ID}/stock`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ change: 4, note: "New studio batch" })
        }
      ),
      { params: Promise.resolve({ id: PRODUCT_ID, variantId: VARIANT_ID }) }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.newVariantStock).toBe(4);
    expect(json.waitingAlerts).toHaveLength(1);
    expect(rpcSingleMock).toHaveBeenCalledWith(
      "adjust_variant_stock",
      expect.objectContaining({
        p_variant_id: VARIANT_ID,
        p_change: 4,
        p_note: "New studio batch"
      })
    );
  });

  it("registers public back-in-stock WhatsApp waitlist entries only when out of stock", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "products") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: PRODUCT_ID,
                  title: "Sold Out Watch",
                  stock_quantity: 0,
                  active: true,
                  status: "active"
                },
                error: null
              })
            })
          })
        };
      }
      return { insert: insertMock };
    });

    const { POST } = await import("@/app/api/back-in-stock/route");
    const res = await POST(
      new Request("https://aura-ardon.vercel.app/api/back-in-stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: PRODUCT_ID,
          phone: "0712 345 678",
          customerName: "Amina"
        })
      })
    );

    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: PRODUCT_ID,
        phone: "254712345678",
        status: "waiting"
      })
    );
  });

  it("routes bulk stock adjustments strictly through adjust_product_stock ledger RPC", async () => {
    rpcSingleMock.mockResolvedValueOnce({
      data: {
        product_id: PRODUCT_ID,
        new_stock_quantity: 10,
        movement_id: "mov-1"
      },
      error: null
    });

    const { POST } = await import("@/app/api/admin/products/bulk/route");
    const res = await POST(
      new Request("https://aura-ardon.vercel.app/api/admin/products/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "stock_adjust",
          productIds: [PRODUCT_ID],
          change: 5,
          note: "Restock shipment"
        })
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.updatedCount).toBe(1);
    expect(rpcSingleMock).toHaveBeenCalledWith(
      "adjust_product_stock",
      expect.objectContaining({
        p_product_id: PRODUCT_ID,
        p_change: 5,
        p_note: "Bulk edit: Restock shipment"
      })
    );
  });
});

