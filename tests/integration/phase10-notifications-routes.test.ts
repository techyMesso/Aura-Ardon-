import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STORE_CONFIG } from "@/lib/site";

const assertAdminRequest = vi.fn();
const getStoreSettingsMock = vi.fn();
const saveStoreSettingsMock = vi.fn();
const listAdminPushSubscriptionsMock = vi.fn();
const getDailySummaryReportDataMock = vi.fn();
const sendDailySummaryNotificationsMock = vi.fn();
const notifyNewOrderMock = vi.fn();
const listDeliveryZonesMock = vi.fn();
const rpcSingleMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/auth", () => ({ assertAdminRequest }));
vi.mock("@/lib/cache", () => ({
  revalidateProductCatalog: vi.fn(),
  revalidateStoreSettings: vi.fn()
}));
vi.mock("@/lib/rate-limit", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({
      ok: true,
      limit: 5,
      remaining: 4,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0
    })
  };
});
vi.mock("@/lib/data", () => ({
  getStoreSettings: (...args: unknown[]) => getStoreSettingsMock(...args),
  saveStoreSettings: (...args: unknown[]) => saveStoreSettingsMock(...args),
  listAdminPushSubscriptions: (...args: unknown[]) =>
    listAdminPushSubscriptionsMock(...args),
  getDailySummaryReportData: (...args: unknown[]) =>
    getDailySummaryReportDataMock(...args),
  listDeliveryZones: (...args: unknown[]) => listDeliveryZonesMock(...args)
}));
vi.mock("@/lib/notifications", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/notifications")>();
  return {
    ...actual,
    sendDailySummaryNotifications: (...args: unknown[]) =>
      sendDailySummaryNotificationsMock(...args),
    notifyNewOrder: (...args: unknown[]) => notifyNewOrderMock(...args)
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: () => ({ single: rpcSingleMock }),
    from: (table: string) => fromMock(table)
  })
}));

describe("Phase 10 settings, admin PWA manifest, push subscriptions, daily summary cron & non-blocking alerts", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ORDER_STATUS_TOKEN_SECRET = "phase10-test-secret-at-least-32-chars";
    assertAdminRequest.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "aura.ardoncompany@gmail.com"
    });
    getStoreSettingsMock.mockResolvedValue({
      id: true,
      ...DEFAULT_STORE_CONFIG,
      updated_at: "2026-05-15T08:00:00.000Z"
    });
  });

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it("serves an installable /admin-scoped PWA web manifest", async () => {
    const { GET } = await import("@/app/admin/manifest.webmanifest/route");
    const response = GET();
    const manifest = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/manifest+json");
    expect(manifest.scope).toBe("/admin");
    expect(manifest.start_url).toBe("/admin/orders");
    expect(manifest.display).toBe("standalone");
  });

  it("saves editable WhatsApp message templates and SMS toggle via PATCH /api/admin/settings", async () => {
    saveStoreSettingsMock.mockImplementation(async (updates: Record<string, unknown>) => ({
      id: true,
      ...DEFAULT_STORE_CONFIG,
      ...updates,
      updated_at: "2026-05-15T10:00:00.000Z"
    }));

    const { PATCH } = await import("@/app/api/admin/settings/route");
    const res = await PATCH(
      new Request("https://example.test/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sms_notifications_enabled: true,
          message_templates: {
            confirmed: "Jambo {name}! Order {order} (KES {total}) confirmed: {track_link}"
          }
        })
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.settings.sms_notifications_enabled).toBe(true);
    expect(json.settings.message_templates.confirmed).toContain("Jambo {name}");
    expect(json.settings.message_templates.delivered).toContain("{review_link}");
  });

  it("stores and deactivates per-admin Web Push subscriptions", async () => {
    const upsertSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "sub-1",
        endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
        user_agent: "Chrome",
        last_used_at: null,
        created_at: "2026-05-15T09:00:00.000Z"
      },
      error: null
    });
    const upsertMock = vi.fn().mockReturnValue({
      select: () => ({ single: upsertSingleMock })
    });
    const deleteEqEndpointMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({
      eq: () => ({ eq: deleteEqEndpointMock })
    });

    fromMock.mockReturnValue({
      upsert: upsertMock,
      update: updateMock
    });

    const { POST, DELETE } = await import("@/app/api/admin/push/subscriptions/route");

    const postRes = await POST(
      new Request("https://example.test/api/admin/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
          keys: {
            p256dh: "BTestPublicKeyLongEnough123",
            auth: "TestAuthSecret123"
          },
          userAgent: "Chrome"
        })
      })
    );
    expect(postRes.status).toBe(201);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "11111111-1111-4111-8111-111111111111",
        user_email: "aura.ardoncompany@gmail.com",
        active: true
      }),
      { onConflict: "endpoint" }
    );

    const delRes = await DELETE(
      new Request("https://example.test/api/admin/push/subscriptions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: "https://fcm.googleapis.com/fcm/send/device-1"
        })
      })
    );
    expect(delRes.status).toBe(200);
    expect(deleteEqEndpointMock).toHaveBeenCalledWith(
      "endpoint",
      "https://fcm.googleapis.com/fcm/send/device-1"
    );
  });

  it("protects /api/cron/daily-summary with CRON_SECRET and delivers summary when authorized", async () => {
    process.env.CRON_SECRET = "daily-summary-cron-secret-999";
    const { GET } = await import("@/app/api/cron/daily-summary/route");

    const unauth = await GET(
      new Request("https://aura-ardon.vercel.app/api/cron/daily-summary", {
        headers: { authorization: "Bearer wrong" }
      })
    );
    expect(unauth.status).toBe(401);

    getDailySummaryReportDataMock.mockResolvedValueOnce({
      date: "2026-05-15",
      ordersTodayCount: 4,
      ordersTodayByStatus: {
        pending: 1,
        confirmed: 1,
        dispatched: 1,
        delivered: 1,
        cancelled: 0,
        returned: 0
      },
      bookedRevenue: 11200,
      collectedRevenue: 8500,
      collectedCash: 3000,
      collectedMpesa: 5500,
      pendingOrdersCount: 1,
      pendingOrdersTotal: 2700,
      overduePending24hCount: 0,
      lowStockThreshold: 3,
      lowStockCount: 2,
      outOfStockCount: 1,
      lowStockItems: [],
      cashStillToCollectCount: 1,
      cashStillToCollectTotal: 2700
    });
    sendDailySummaryNotificationsMock.mockResolvedValueOnce({
      email: { sent: true, id: "em_1" },
      push: { sent: 1, failed: 0, deactivated: 0 }
    });

    const ok = await GET(
      new Request(
        "https://aura-ardon.vercel.app/api/cron/daily-summary?date=2026-05-15",
        {
          headers: { authorization: "Bearer daily-summary-cron-secret-999" }
        }
      )
    );
    const json = await ok.json();
    expect(ok.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.summary.ordersTodayCount).toBe(4);
    expect(json.delivery.email.sent).toBe(true);
    expect(json.delivery.push.sent).toBe(1);
  });

  it("never fails POST /api/orders when new-order notification throws", async () => {
    listDeliveryZonesMock.mockResolvedValueOnce([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Westlands",
        fee: 200,
        active: true,
        sort_order: 1,
        is_outside_nairobi: false,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      }
    ]);
    rpcSingleMock.mockResolvedValueOnce({
      data: {
        order_id: "44444444-4444-4444-8444-444444444444",
        order_number: "AA-10099",
        subtotal: 2500,
        discount_code: null,
        discount_amount: 0,
        delivery_zone_name: "Westlands",
        shipping_fee: 200,
        total: 2700,
        status: "pending",
        replayed: false,
        item_summary: [
          { title: "Classic Watch", quantity: 1, unit_price: 2500, line_total: 2500 }
        ]
      },
      error: null
    });
    notifyNewOrderMock.mockRejectedValueOnce(new Error("Resend crashed unexpectedly"));

    const { POST } = await import("@/app/api/orders/route");
    const response = await POST(
      new Request("https://aura-ardon.vercel.app/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "idem-notify-resilience"
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
          deliveryZoneId: "11111111-1111-4111-8111-111111111111",
          buildingLandmark: "Sarit Centre",
          isGift: false,
          marketingOptIn: false,
          website: ""
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.orderNumber).toBe("AA-10099");
    expect(notifyNewOrderMock).toHaveBeenCalledTimes(1);
  });
});

