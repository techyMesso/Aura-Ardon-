import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STORE_CONFIG } from "@/lib/site";

const assertAdminRequest = vi.fn();
const rpcSingleMock = vi.fn();
const fromMock = vi.fn();
const getStoreSettingsMock = vi.fn();
const listDeliveryZonesMock = vi.fn();

vi.mock("@/lib/auth", () => ({ assertAdminRequest }));
vi.mock("@/lib/cache", () => ({ revalidateProductCatalog: vi.fn() }));
vi.mock("@/lib/rate-limit", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({
      ok: true,
      limit: 25,
      remaining: 24,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0
    })
  };
});
vi.mock("@/lib/data", () => ({
  getStoreSettings: (...args: unknown[]) => getStoreSettingsMock(...args),
  listDeliveryZones: (...args: unknown[]) => listDeliveryZonesMock(...args)
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: (_fn: string, params: unknown) => ({
      single: () => rpcSingleMock(params)
    }),
    from: (table: string) => fromMock(table)
  })
}));

const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const ZONE_ID = "11111111-1111-4111-8111-111111111111";
const DISCOUNT_ID = "55555555-5555-4555-8555-555555555555";

describe("Phase 6 discount validation and admin CRUD APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertAdminRequest.mockResolvedValue({ email: "admin@test" });
    getStoreSettingsMock.mockResolvedValue({
      id: true,
      ...DEFAULT_STORE_CONFIG,
      is_store_open: true,
      updated_at: "2026-01-01T00:00:00.000Z"
    });
    listDeliveryZonesMock.mockResolvedValue([
      {
        id: ZONE_ID,
        name: "Westlands",
        fee: 200,
        active: true,
        sort_order: 1,
        is_outside_nairobi: false,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      }
    ]);
  });

  it("validates promo codes server-side using DB product prices (never client prices)", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        in: vi.fn().mockResolvedValue({
          data: [{ id: PRODUCT_ID, price: "2000.00", active: true }],
          error: null
        })
      })
    });
    rpcSingleMock.mockResolvedValueOnce({
      data: {
        discount_code_id: DISCOUNT_ID,
        normalized_code: "WELCOME10",
        discount_type: "percent",
        discount_value: 10,
        discount_amount: 200,
        free_delivery_applied: false,
        delivery_fee: 200,
        total: 2000
      },
      error: null
    });

    const { POST } = await import("@/app/api/discounts/validate/route");
    const response = await POST(
      new Request("https://aura-ardon.vercel.app/api/discounts/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "welcome10",
          items: [{ productId: PRODUCT_ID, quantity: 1 }],
          deliveryZoneId: ZONE_ID,
          phone: "0712 345 678"
        })
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.code).toBe("WELCOME10");
    expect(json.discountAmount).toBe(200);
    expect(json.total).toBe(2000);
    expect(rpcSingleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        p_code: "WELCOME10",
        p_subtotal: 2000,
        p_customer_phone: "254712345678"
      })
    );
  });

  it("creates, toggles, and gracefully deactivates redeemed discount codes in admin CRUD", async () => {
    const insertSingleMock = vi.fn().mockResolvedValue({
      data: { id: DISCOUNT_ID, code: "VIP20", type: "percent", value: "20.00", active: true },
      error: null
    });
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const deleteEqMock = vi.fn().mockResolvedValue({
      error: { code: "23503", message: "violates foreign key constraint" }
    });

    fromMock.mockReturnValue({
      insert: () => ({ select: () => ({ single: insertSingleMock }) }),
      delete: () => ({ eq: deleteEqMock }),
      update: () => ({ eq: updateEqMock })
    });

    const { POST } = await import("@/app/api/admin/discounts/route");
    const createRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/admin/discounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "vip20",
          description: "VIP discount",
          type: "percent",
          value: 20,
          min_order_amount: 1000,
          starts_at: null,
          ends_at: null,
          usage_limit: 50,
          per_phone_limit: 1,
          first_order_only: false,
          active: true
        })
      })
    );
    expect(createRes.status).toBe(201);

    const { DELETE } = await import("@/app/api/admin/discounts/[id]/route");
    const delRes = await DELETE(
      new Request(`https://aura-ardon.vercel.app/api/admin/discounts/${DISCOUNT_ID}`, {
        method: "DELETE"
      }),
      { params: Promise.resolve({ id: DISCOUNT_ID }) }
    );
    const delJson = await delRes.json();
    expect(delRes.status).toBe(200);
    expect(delJson.deactivated).toBe(true);
    expect(updateEqMock).toHaveBeenCalledWith("id", DISCOUNT_ID);
  });
});

