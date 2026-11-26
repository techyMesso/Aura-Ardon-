import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STORE_CONFIG } from "@/lib/site";

const rpcSingleMock = vi.fn();
const getOrderByNumberMock = vi.fn();
const listDeliveryZonesMock = vi.fn();
const getStoreSettingsMock = vi.fn();
const rateLimitCounters = new Map<string, number>();

const checkRateLimitMock = vi.fn(
  async ({ key, limit, windowMs }: { key: string; limit: number; windowMs: number }) => {
    const nextCount = (rateLimitCounters.get(key) ?? 0) + 1;
    rateLimitCounters.set(key, nextCount);
    const ok = nextCount <= limit;
    return {
      ok,
      limit,
      remaining: Math.max(limit - nextCount, 0),
      resetAt: Date.now() + windowMs,
      retryAfterSeconds: ok ? 0 : Math.ceil(windowMs / 1000)
    };
  }
);

vi.mock("@/lib/rate-limit", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: (args: { key: string; limit: number; windowMs: number }) =>
      checkRateLimitMock(args)
  };
});

vi.mock("@/lib/cache", () => ({
  revalidateProductCatalog: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: () => ({
      single: rpcSingleMock
    })
  })
}));

vi.mock("@/lib/data", () => ({
  getStoreSettings: (...args: unknown[]) => getStoreSettingsMock(...args),
  listDeliveryZones: (...args: unknown[]) => listDeliveryZonesMock(...args),
  getOrderByNumber: (...args: unknown[]) => getOrderByNumberMock(...args)
}));

const WESTLANDS_ZONE = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Westlands",
  fee: 200,
  active: true,
  sort_order: 1,
  is_outside_nairobi: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
};

const OUTSIDE_ZONE = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Outside Nairobi (courier)",
  fee: 400,
  active: true,
  sort_order: 16,
  is_outside_nairobi: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
};

function makeOrderRequest(
  idempotencyKey: string,
  overrides: Record<string, unknown> = {},
  ip = "203.0.113.25"
) {
  return new Request("https://aura-ardon.vercel.app/api/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      items: [
        {
          productId: "33333333-3333-4333-8333-333333333333",
          quantity: 1
        }
      ],
      fullName: "Amina Wanjiku",
      phone: "0712 345 678",
      deliveryZoneId: WESTLANDS_ZONE.id,
      buildingLandmark: "Sarit Centre, 3rd floor",
      isGift: false,
      marketingOptIn: false,
      website: "",
      ...overrides
    })
  });
}

describe("Phase 3 /api/orders & /api/orders/track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitCounters.clear();
    process.env.ORDER_STATUS_TOKEN_SECRET = "phase3-test-secret-at-least-32-chars";
    getStoreSettingsMock.mockResolvedValue({
      id: true,
      ...DEFAULT_STORE_CONFIG,
      is_store_open: true,
      updated_at: "2026-01-01T00:00:00.000Z"
    });
    listDeliveryZonesMock.mockResolvedValue([WESTLANDS_ZONE, OUTSIDE_ZONE]);
  });

  afterEach(() => {
    rateLimitCounters.clear();
  });

  it("places a WhatsApp order transactionally and returns confirmationPath and capped wa.me URL", async () => {
    rpcSingleMock.mockResolvedValueOnce({
      data: {
        order_id: "44444444-4444-4444-8444-444444444444",
        order_number: "AA-7F3K2",
        subtotal: 1850,
        discount_code: null,
        discount_amount: 0,
        delivery_zone_name: "Westlands",
        shipping_fee: 200,
        total: 2050,
        status: "pending",
        replayed: false,
        item_summary: [
          {
            title: "Nairobi Classic Watch",
            quantity: 1,
            unit_price: 1850,
            line_total: 1850
          }
        ]
      },
      error: null
    });

    const { POST } = await import("@/app/api/orders/route");
    const response = await POST(makeOrderRequest("idem-order-1"));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.orderNumber).toBe("AA-7F3K2");
    expect(body.total).toBe(2050);
    expect(body.confirmationPath).toContain("/order/AA-7F3K2?t=");
    expect(body.whatsappUrl).toContain("https://wa.me/254718038825?text=");
    expect(decodeURIComponent(body.whatsappUrl)).toContain("Order: AA-7F3K2");
    expect(decodeURIComponent(body.whatsappUrl)).toContain("Delivery (Westlands): KES 200");
  });

  it("rejects honeypot bot submissions without touching the database", async () => {
    const { POST } = await import("@/app/api/orders/route");
    const response = await POST(
      makeOrderRequest("idem-bot", { website: "https://spam.example" })
    );

    expect(response.status).toBe(400);
    expect(rpcSingleMock).not.toHaveBeenCalled();
  });

  it("requires town/county when Outside Nairobi zone is selected", async () => {
    const { POST } = await import("@/app/api/orders/route");
    const response = await POST(
      makeOrderRequest("idem-outside", {
        deliveryZoneId: OUTSIDE_ZONE.id,
        townCounty: ""
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Town or county is required/i);
    expect(rpcSingleMock).not.toHaveBeenCalled();
  });

  it("surfaces exact sold-out item message with HTTP 409 on stock contention", async () => {
    rpcSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Item just sold out: Gold-Tone Mesh Bracelet Watch" }
    });

    const { POST } = await import("@/app/api/orders/route");
    const response = await POST(makeOrderRequest("idem-soldout"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Gold-Tone Mesh Bracelet Watch");
  });

  it("enforces max 5 orders per 10 minutes per IP and per normalized phone", async () => {
    rpcSingleMock.mockResolvedValue({
      data: {
        order_id: "44444444-4444-4444-8444-444444444444",
        order_number: "AA-7F3K2",
        subtotal: 500,
        discount_code: null,
        discount_amount: 0,
        delivery_zone_name: "Westlands",
        shipping_fee: 200,
        total: 700,
        status: "pending",
        replayed: false,
        item_summary: []
      },
      error: null
    });

    const { POST } = await import("@/app/api/orders/route");
    for (let i = 1; i <= 5; i += 1) {
      const okRes = await POST(
        makeOrderRequest(`idem-rl-${i}`, { phone: `071234567${i}` }, "198.51.100.77")
      );
      expect(okRes.status).toBe(201);
    }

    const blockedIp = await POST(
      makeOrderRequest("idem-rl-6", { phone: "0712345679" }, "198.51.100.77")
    );
    expect(blockedIp.status).toBe(429);
    expect(blockedIp.headers.get("Retry-After")).toBeTruthy();
    expect(checkRateLimitMock).toHaveBeenCalledWith({
      key: "order:ip:198.51.100.77",
      limit: 5,
      windowMs: 600_000
    });

    // Now test per-phone limit across distinct IPs using equivalent Kenyan phone formats
    const phoneFormats = [
      "0722 111 222",
      "+254722111222",
      "254722111222",
      "0722111222",
      "+254 722 111 222"
    ];
    for (let i = 0; i < phoneFormats.length; i += 1) {
      const okRes = await POST(
        makeOrderRequest(
          `idem-phone-${i}`,
          { phone: phoneFormats[i] },
          `198.51.100.${10 + i}`
        )
      );
      expect(okRes.status).toBe(201);
    }

    const blockedPhone = await POST(
      makeOrderRequest("idem-phone-6", { phone: "0722111222" }, "198.51.100.99")
    );
    expect(blockedPhone.status).toBe(429);
    expect(blockedPhone.headers.get("Retry-After")).toBeTruthy();
    expect(checkRateLimitMock).toHaveBeenCalledWith({
      key: "order:phone:254722111222",
      limit: 5,
      windowMs: 600_000
    });
  });

  it("tracks an order only when orderNumber AND phone match", async () => {
    getOrderByNumberMock.mockResolvedValue({
      order: {
        id: "44444444-4444-4444-8444-444444444444",
        order_number: "AA-7F3K2",
        status: "confirmed",
        order_status: "CONFIRMED",
        payment_status: "PENDING",
        payment_method: "WHATSAPP",
        customer_name: "Amina Wanjiku",
        customer_phone: "254712345678",
        customer_location: "Westlands — Sarit Centre",
        delivery_zone_name: "Westlands",
        delivery_address: "Sarit Centre",
        subtotal: "1850.00",
        shipping_fee: "200.00",
        total: "2050.00",
        created_at: "2026-05-01T10:00:00.000Z"
      },
      items: [
        {
          id: "item-1",
          order_id: "44444444-4444-4444-8444-444444444444",
          product_id: "p1",
          product_title: "Nairobi Classic Watch",
          quantity: 1,
          unit_price: "1850.00",
          created_at: "2026-05-01T10:00:00.000Z"
        }
      ]
    });

    const { POST } = await import("@/app/api/orders/track/route");

    const okRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/orders/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: "aa-7f3k2", phone: "0712 345 678" })
      })
    );
    expect(okRes.status).toBe(200);
    const okBody = await okRes.json();
    expect(okBody.status).toBe("confirmed");
    expect(okBody.orderNumber).toBe("AA-7F3K2");

    const wrongPhoneRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/orders/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: "AA-7F3K2", phone: "0799 999 999" })
      })
    );
    expect(wrongPhoneRes.status).toBe(404);
  });
});

