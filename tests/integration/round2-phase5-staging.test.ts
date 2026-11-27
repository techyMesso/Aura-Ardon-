import fs from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertAdminRequest,
  mockRecordAuditLog,
  mockRevalidateDeliveryZones,
  mockRevalidateProductCatalog,
  mockGetStoreSettings,
  mockListDeliveryZones,
  mockGetAnalyticsDashboardData,
  mockCheckRateLimit,
  mockFrom,
  mockRpc
} = vi.hoisted(() => ({
  mockAssertAdminRequest: vi.fn(),
  mockRecordAuditLog: vi.fn(),
  mockRevalidateDeliveryZones: vi.fn(),
  mockRevalidateProductCatalog: vi.fn(),
  mockGetStoreSettings: vi.fn(),
  mockListDeliveryZones: vi.fn(),
  mockGetAnalyticsDashboardData: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn()
}));

vi.mock("@/lib/auth", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    assertAdminRequest: mockAssertAdminRequest
  };
});

vi.mock("@/lib/audit", () => ({
  recordAuditLog: mockRecordAuditLog
}));

vi.mock("@/lib/cache", () => ({
  revalidateDeliveryZones: mockRevalidateDeliveryZones,
  revalidateProductCatalog: mockRevalidateProductCatalog
}));

vi.mock("@/lib/data", () => ({
  getStoreSettings: mockGetStoreSettings,
  listDeliveryZones: mockListDeliveryZones,
  getAnalyticsDashboardData: mockGetAnalyticsDashboardData
}));

vi.mock("@/lib/rate-limit", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: mockCheckRateLimit
  };
});

vi.mock("@/lib/notifications", () => ({
  notifyNewOrder: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => mockFrom(table),
    rpc: (...args: unknown[]) => mockRpc(...args)
  })
}));

import { GET as getAnalytics } from "@/app/api/admin/analytics/route";
import { PATCH as patchZone } from "@/app/api/admin/delivery-zones/[id]/route";
import { POST as trackEvent } from "@/app/api/events/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { buildEmptyAnalyticsDashboardReport } from "@/lib/analytics";
import { toNairobiDateIso } from "@/lib/invoices";
import { DEFAULT_STORE_CONFIG } from "@/lib/site";

const ZONE_ID = "14630fbd-15db-40b7-824e-b0fd83086f3b";
const PROD_ID = "33333333-3333-4333-8333-333333333333";

describe("Round 2 Phase 5 — Offline API & SQL contract integration tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = "owner@example.com";
    process.env.ORDER_STATUS_TOKEN_SECRET = "phase5-test-secret-at-least-32-chars";
    mockAssertAdminRequest.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
      app_metadata: { role: "owner" }
    });
    mockRecordAuditLog.mockResolvedValue(undefined);
    mockCheckRateLimit.mockResolvedValue({
      ok: true,
      limit: 60,
      remaining: 59,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0
    });
    mockGetStoreSettings.mockResolvedValue({
      id: true,
      ...DEFAULT_STORE_CONFIG,
      is_store_open: true,
      updated_at: "2026-11-27T00:00:00.000Z"
    });
    mockListDeliveryZones.mockResolvedValue([
      {
        id: ZONE_ID,
        name: "Westlands",
        fee: 200,
        active: true,
        sort_order: 1,
        is_outside_nairobi: false,
        created_at: "2026-11-01T00:00:00.000Z",
        updated_at: "2026-11-01T00:00:00.000Z"
      }
    ]);
  });

  it("blocks staff from editing delivery zones and audits owner fee edits without touching orders or invoices", async () => {
    mockAssertAdminRequest.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const staffDenied = await patchZone(
      new Request(`https://aura-ardon.vercel.app/api/admin/delivery-zones/${ZONE_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ fee: 500 })
      }),
      { params: Promise.resolve({ id: ZONE_ID }) }
    );
    expect(staffDenied.status).toBe(403);
    expect(mockAssertAdminRequest).toHaveBeenCalledWith({ requiredRole: "owner" });

    const beforeZone = {
      id: ZONE_ID,
      name: "Westlands",
      fee: 200,
      active: true,
      sort_order: 1,
      is_outside_nairobi: false,
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z"
    };
    const mutatedTables: string[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === "delivery_zones") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: beforeZone, error: null })
            })
          }),
          update: () => {
            mutatedTables.push(table);
            return {
              eq: () => ({
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: { ...beforeZone, fee: 550 },
                      error: null
                    })
                })
              })
            };
          }
        };
      }
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ count: 4, error: null })
          })
        };
      }
      throw new Error(`Unexpected mutation on ${table}`);
    });

    const ownerOk = await patchZone(
      new Request(`https://aura-ardon.vercel.app/api/admin/delivery-zones/${ZONE_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ fee: 550 })
      }),
      { params: Promise.resolve({ id: ZONE_ID }) }
    );
    expect(ownerOk.status).toBe(200);
    expect(mutatedTables).toEqual(["delivery_zones"]);
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery_zone.updated",
        entity: "delivery_zone",
        entityId: ZONE_ID,
        before: expect.objectContaining({ fee: 200 }),
        after: expect.objectContaining({ fee: 550 })
      })
    );
  });

  it("excludes internal events by default in GET /api/admin/analytics", async () => {
    mockGetAnalyticsDashboardData.mockResolvedValueOnce(
      buildEmptyAnalyticsDashboardReport("2026-11-01", "2026-11-27", true)
    );

    const res = await getAnalytics(
      new Request(
        "https://aura-ardon.vercel.app/api/admin/analytics?preset=custom&from=2026-11-01&to=2026-11-27"
      )
    );
    expect(res.status).toBe(200);
    const defaultCallArg = mockGetAnalyticsDashboardData.mock.calls[0]?.[0] as {
      from: string;
      to: string;
      includeOwnerMetrics: boolean;
      includeInternal?: boolean;
    };
    expect(defaultCallArg.from).toBe("2026-11-01");
    expect(defaultCallArg.to).toBe("2026-11-27");
    expect(Boolean(defaultCallArg.includeInternal)).toBe(false);

    mockGetAnalyticsDashboardData.mockResolvedValueOnce(
      buildEmptyAnalyticsDashboardReport("2026-11-01", "2026-11-27", true)
    );
    const resIncl = await getAnalytics(
      new Request(
        "https://aura-ardon.vercel.app/api/admin/analytics?preset=custom&from=2026-11-01&to=2026-11-27&includeInternal=1"
      )
    );
    expect(resIncl.status).toBe(200);
    expect(mockGetAnalyticsDashboardData).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeInternal: true })
    );
  });

  it("ensures whatsapp_order_sent is recorded strictly once per saved order and never on order failure", async () => {
    // 1. Simulate failed POST /api/orders (e.g. out-of-stock 409) -> no orderNumber returned
    mockRpc.mockReturnValueOnce({
      single: () =>
        Promise.resolve({
          data: null,
          error: { message: "Item just sold out: Gold Cuff" }
        })
    });

    const failedOrderRes = await createOrder(
      new Request("https://aura-ardon.vercel.app/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "p5-fail-1"
        },
        body: JSON.stringify({
          items: [{ productId: PROD_ID, quantity: 1 }],
          fullName: "Amina Wanjiku",
          phone: "0712345678",
          deliveryZoneId: ZONE_ID,
          buildingLandmark: "Sarit Centre",
          website: ""
        })
      })
    );
    expect(failedOrderRes.status).toBe(409);
    const failedBody = (await failedOrderRes.json()) as { orderNumber?: string };
    expect(failedBody.orderNumber).toBeUndefined();

    // Without a saved orderNumber, /api/events rejects whatsapp_order_sent with HTTP 400
    const insertEventMock = vi.fn().mockResolvedValue({ error: null });
    const existingLimitMock = vi.fn().mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: existingLimitMock
          })
        })
      }),
      insert: insertEventMock
    });

    const rejectedEvent = await trackEvent(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Safari/604.1"
        },
        body: JSON.stringify({
          name: "whatsapp_order_sent",
          sessionId: "p5-session-123456",
          path: "/checkout"
        })
      })
    );
    expect(rejectedEvent.status).toBe(400);
    expect(insertEventMock).not.toHaveBeenCalled();

    // 2. Successful order returns orderNumber -> whatsapp_order_sent inserts once, duplicate dedupes
    mockRpc.mockReturnValueOnce({
      single: () =>
        Promise.resolve({
          data: {
            order_id: "44444444-4444-4444-8444-444444444444",
            order_number: "AA-P5001",
            subtotal: 3000,
            discount_code: null,
            discount_amount: 0,
            delivery_zone_name: "Westlands",
            shipping_fee: 200,
            total: 3200,
            status: "pending",
            replayed: false,
            item_summary: [
              { title: "Gold Cuff", quantity: 1, unit_price: 3000, line_total: 3000 }
            ]
          },
          error: null
        })
    });

    const savedOrderRes = await createOrder(
      new Request("https://aura-ardon.vercel.app/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "p5-ok-1"
        },
        body: JSON.stringify({
          items: [{ productId: PROD_ID, quantity: 1 }],
          fullName: "Amina Wanjiku",
          phone: "0712345678",
          deliveryZoneId: ZONE_ID,
          buildingLandmark: "Sarit Centre",
          website: ""
        })
      })
    );
    expect(savedOrderRes.status).toBe(201);
    const savedBody = (await savedOrderRes.json()) as { orderNumber: string };
    expect(savedBody.orderNumber).toBe("AA-P5001");

    const firstEvent = await trackEvent(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Safari/604.1"
        },
        body: JSON.stringify({
          name: "whatsapp_order_sent",
          orderNumber: savedBody.orderNumber,
          sessionId: "p5-session-123456",
          path: "/checkout"
        })
      })
    );
    expect(firstEvent.status).toBe(201);
    expect(insertEventMock).toHaveBeenCalledTimes(1);

    existingLimitMock.mockResolvedValueOnce({ data: [{ id: "ev-1" }], error: null });
    const duplicateEvent = await trackEvent(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Safari/604.1"
        },
        body: JSON.stringify({
          name: "whatsapp_order_sent",
          orderNumber: savedBody.orderNumber,
          sessionId: "p5-session-123456",
          path: "/checkout"
        })
      })
    );
    expect(duplicateEvent.status).toBe(200);
    expect(insertEventMock).toHaveBeenCalledTimes(1);

    // Verify checkout client only fires whatsapp_order_sent AFTER verifying order success
    const checkoutClientSource = fs.readFileSync(
      path.join(process.cwd(), "components", "storefront", "checkout-page-client.tsx"),
      "utf8"
    );
    const errorGuardPos = checkoutClientSource.indexOf(
      "if (!response.ok || !data.ok || !data.confirmationPath || !data.orderNumber)"
    );
    const trackCallPos = checkoutClientSource.indexOf(
      'trackStorefrontEvent("whatsapp_order_sent"'
    );
    expect(errorGuardPos).toBeGreaterThan(-1);
    expect(trackCallPos).toBeGreaterThan(errorGuardPos);
  });
});

// ─── LIVE STAGING SUPABASE DB INTEGRATION SUITE ───────────────────────────────
const PROD_PROJECT_REF = "bjasoyhcxubrkxrqurfr";
const RUN_STAGING_DB_TESTS = process.env.RUN_STAGING_DB_TESTS === "1";
const STAGING_URL =
  process.env.STAGING_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const STAGING_SERVICE_KEY =
  process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";
const STAGING_ANON_KEY =
  process.env.STAGING_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

describe.runIf(RUN_STAGING_DB_TESTS)(
  "Round 2 Phase 5 live staging-DB integration suite",
  () => {
    let adminClient: SupabaseClient;
    let anonClient: SupabaseClient;

    const createdZoneIds: string[] = [];
    const createdCategoryIds: string[] = [];
    const createdProductIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdEventIds: string[] = [];
    const createdAuditIds: string[] = [];
    const createdAuthUserIds: string[] = [];

    beforeAll(() => {
      if (STAGING_URL.includes(PROD_PROJECT_REF)) {
        throw new Error(
          "Refusing to run Round 2 Phase 5 staging integration tests against production."
        );
      }
      adminClient = createClient(STAGING_URL, STAGING_SERVICE_KEY, {
        auth: { persistSession: false }
      });
      anonClient = createClient(STAGING_URL, STAGING_ANON_KEY, {
        auth: { persistSession: false }
      });
    });

    afterAll(async () => {
      if (createdEventIds.length > 0) {
        await adminClient.from("events").delete().in("id", createdEventIds);
      }
      if (createdOrderIds.length > 0) {
        const { data: invs } = await adminClient
          .from("invoices")
          .select("id")
          .in("order_id", createdOrderIds);
        const invIds = (invs ?? []).map(row => row.id as string);
        if (invIds.length > 0) {
          await adminClient.from("payments").delete().in("invoice_id", invIds);
          await adminClient.from("credit_notes").delete().in("invoice_id", invIds);
          await adminClient.from("invoices").delete().in("id", invIds);
        }
        await adminClient
          .from("order_status_history")
          .delete()
          .in("order_id", createdOrderIds);
        await adminClient.from("stock_movements").delete().in("order_id", createdOrderIds);
        await adminClient.from("order_items").delete().in("order_id", createdOrderIds);
        await adminClient.from("orders").delete().in("id", createdOrderIds);
      }
      if (createdProductIds.length > 0) {
        await adminClient
          .from("stock_movements")
          .delete()
          .in("product_id", createdProductIds);
        await adminClient.from("products").delete().in("id", createdProductIds);
      }
      if (createdCategoryIds.length > 0) {
        await adminClient.from("categories").delete().in("id", createdCategoryIds);
      }
      if (createdZoneIds.length > 0) {
        await adminClient.from("delivery_zones").delete().in("id", createdZoneIds);
      }
      if (createdAuditIds.length > 0) {
        await adminClient.from("audit_log").delete().in("id", createdAuditIds);
      }
      for (const userId of createdAuthUserIds) {
        await adminClient.from("admin_users").delete().eq("user_id", userId);
        await adminClient.auth.admin.deleteUser(userId);
      }
    });

    async function seedStagingProductAndZone(initialFee = 350, initialStock = 5) {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const { data: zone, error: zoneErr } = await adminClient
        .from("delivery_zones")
        .insert({
          name: `R2P5 Zone ${suffix}`,
          fee: initialFee,
          active: true,
          sort_order: 998,
          is_outside_nairobi: false
        })
        .select("id, fee")
        .single();
      if (zoneErr || !zone) throw new Error(zoneErr?.message ?? "Failed to seed zone");
      createdZoneIds.push(zone.id as string);

      const { data: cat, error: catErr } = await adminClient
        .from("categories")
        .insert({
          name: `R2P5 Cat ${suffix}`,
          slug: `r2p5-cat-${suffix}`,
          description: "Round 2 Phase 5 staging test category",
          display_order: 998,
          active: true
        })
        .select("id")
        .single();
      if (catErr || !cat) throw new Error(catErr?.message ?? "Failed to seed category");
      createdCategoryIds.push(cat.id as string);

      const { data: prod, error: prodErr } = await adminClient
        .from("products")
        .insert({
          title: `R2P5 Watch ${suffix}`,
          slug: `r2p5-watch-${suffix}`,
          description: "Round 2 Phase 5 staging test watch",
          category: "Watches",
          category_id: cat.id,
          price: 2500,
          cost_price: 1200,
          stock_quantity: initialStock,
          images: ["https://example.com/watch.jpg"],
          active: true,
          status: "active"
        })
        .select("id")
        .single();
      if (prodErr || !prod) throw new Error(prodErr?.message ?? "Failed to seed product");
      createdProductIds.push(prod.id as string);

      return {
        suffix,
        zoneId: zone.id as string,
        productId: prod.id as string
      };
    }

    it("preserves existing order/invoice fee snapshots on zone edit, logs audit entry, and blocks staff RLS writes", async () => {
      const { suffix, zoneId, productId } = await seedStagingProductAndZone(350, 5);

      const { data: placed, error: placeErr } = await adminClient
        .rpc("place_order", {
          p_customer_name: "TEST Zone Snapshot",
          p_customer_phone: "254712500501",
          p_delivery_zone_id: zoneId,
          p_delivery_address: "Sarit Centre",
          p_town_county: null,
          p_notes: null,
          p_is_gift: false,
          p_gift_note: null,
          p_hide_prices: false,
          p_marketing_opt_in: false,
          p_discount_code: null,
          p_discount_amount: 0,
          p_idempotency_key: `r2p5-zone-${suffix}`,
          p_items: [{ product_id: productId, quantity: 1 }]
        })
        .single();
      expect(placeErr).toBeNull();
      const orderId = (placed as { order_id: string }).order_id;
      createdOrderIds.push(orderId);

      const confirmRes = await adminClient.rpc("set_order_status", {
        p_order_id: orderId,
        p_to_status: "confirmed",
        p_changed_by: "r2p5-staging",
        p_reason: "Confirm before zone edit"
      });
      expect(confirmRes.error).toBeNull();

      // Update zone fee 350 -> 800 and record audit_log entry
      const { error: updateErr } = await adminClient
        .from("delivery_zones")
        .update({ fee: 800 })
        .eq("id", zoneId);
      expect(updateErr).toBeNull();

      const { data: auditRow, error: auditErr } = await adminClient
        .from("audit_log")
        .insert({
          actor_email: "r2p5-owner@staging.local",
          actor_role: "owner",
          action: "delivery_zone.updated",
          entity: "delivery_zone",
          entity_id: zoneId,
          before: { fee: 350 },
          after: { fee: 800 }
        })
        .select("id, action, before, after")
        .single();
      expect(auditErr).toBeNull();
      createdAuditIds.push(auditRow!.id as string);
      expect(auditRow?.before).toEqual({ fee: 350 });
      expect(auditRow?.after).toEqual({ fee: 800 });

      // Existing order & invoice MUST keep fee snapshot = 350
      const [{ data: orderAfter }, { data: invoiceAfter }] = await Promise.all([
        adminClient
          .from("orders")
          .select("shipping_fee, total")
          .eq("id", orderId)
          .single(),
        adminClient
          .from("invoices")
          .select("delivery_fee, total")
          .eq("order_id", orderId)
          .single()
      ]);
      expect(Number(orderAfter?.shipping_fee)).toBe(350);
      expect(Number(orderAfter?.total)).toBe(2850);
      expect(Number(invoiceAfter?.delivery_fee)).toBe(350);
      expect(Number(invoiceAfter?.total)).toBe(2850);

      // Staff user attempting to edit delivery_zones under RLS MUST be blocked
      const staffEmail = `r2p5-staff-${suffix}@staging.test`;
      const staffPassword = `StgPass!${suffix}99`;
      const { data: createdUser, error: userErr } =
        await adminClient.auth.admin.createUser({
          email: staffEmail,
          password: staffPassword,
          email_confirm: true,
          app_metadata: { role: "staff" }
        });
      expect(userErr).toBeNull();
      const staffUserId = createdUser!.user!.id;
      createdAuthUserIds.push(staffUserId);

      await adminClient.from("admin_users").insert({
        user_id: staffUserId,
        email: staffEmail,
        role: "staff",
        active: true
      });

      const { data: signedIn, error: signInErr } =
        await anonClient.auth.signInWithPassword({
          email: staffEmail,
          password: staffPassword
        });
      expect(signInErr).toBeNull();

      const staffClient = createClient(STAGING_URL, STAGING_ANON_KEY, {
        auth: { persistSession: false },
        global: {
          headers: { Authorization: `Bearer ${signedIn.session!.access_token}` }
        }
      });

      const { data: staffUpdatedRows } = await staffClient
        .from("delivery_zones")
        .update({ fee: 999 })
        .eq("id", zoneId)
        .select("id, fee");
      expect(staffUpdatedRows ?? []).toHaveLength(0);

      const { data: zoneVerify } = await adminClient
        .from("delivery_zones")
        .select("fee")
        .eq("id", zoneId)
        .single();
      expect(Number(zoneVerify?.fee)).toBe(800);
    });

    it("issues TEST-INV without consuming real INV sequence, excludes test order from KPIs, and restores stock on cancel", async () => {
      const { suffix, zoneId, productId } = await seedStagingProductAndZone(250, 5);
      const todayIso = toNairobiDateIso(new Date());
      const currentYear = Number(todayIso.slice(0, 4));

      // Snapshot real invoice counter & dashboard KPIs before test order
      const [{ data: counterBefore }, { data: dashBefore, error: dashBeforeErr }] =
        await Promise.all([
          adminClient
            .from("document_counters")
            .select("last_number")
            .eq("doc_type", "invoice")
            .eq("year", currentYear)
            .maybeSingle(),
          adminClient.rpc("get_analytics_dashboard", {
            p_from: todayIso,
            p_to: todayIso,
            p_include_owner_metrics: true,
            p_include_internal: false
          })
        ]);
      expect(dashBeforeErr).toBeNull();
      const realLastNumberBefore = Number(counterBefore?.last_number ?? 0);
      const kpisBefore = (dashBefore as { kpis: Record<string, unknown> }).kpis;
      const funnelBefore = (dashBefore as { funnel: Record<string, number> }).funnel;

      // Place TEST order -> stock 5 -> 4
      const { data: placed, error: placeErr } = await adminClient
        .rpc("place_order", {
          p_customer_name: "TEST Staging KPI Order",
          p_customer_phone: "254712500502",
          p_delivery_zone_id: zoneId,
          p_delivery_address: "Yaya Centre",
          p_town_county: null,
          p_notes: null,
          p_is_gift: false,
          p_gift_note: null,
          p_hide_prices: false,
          p_marketing_opt_in: false,
          p_discount_code: null,
          p_discount_amount: 0,
          p_idempotency_key: `r2p5-test-ord-${suffix}`,
          p_items: [{ product_id: productId, quantity: 1 }]
        })
        .single();
      expect(placeErr).toBeNull();
      const testOrderId = (placed as { order_id: string; order_number: string }).order_id;
      const testOrderNumber = (placed as { order_number: string }).order_number;
      createdOrderIds.push(testOrderId);

      const { data: orderRow } = await adminClient
        .from("orders")
        .select("is_test")
        .eq("id", testOrderId)
        .single();
      expect(orderRow?.is_test).toBe(true);

      const { data: stockReserved } = await adminClient
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      expect(stockReserved?.stock_quantity).toBe(4);

      // Confirm TEST order -> issues TEST-INV-NNNN without consuming real invoice counter
      const confirmRes = await adminClient.rpc("set_order_status", {
        p_order_id: testOrderId,
        p_to_status: "confirmed",
        p_changed_by: "r2p5-staging",
        p_reason: "Confirm test order"
      });
      expect(confirmRes.error).toBeNull();

      const [{ data: testInv }, { data: counterAfter }, { data: dashAfterConfirm }] =
        await Promise.all([
          adminClient
            .from("invoices")
            .select("invoice_number, is_test")
            .eq("order_id", testOrderId)
            .single(),
          adminClient
            .from("document_counters")
            .select("last_number")
            .eq("doc_type", "invoice")
            .eq("year", currentYear)
            .maybeSingle(),
          adminClient.rpc("get_analytics_dashboard", {
            p_from: todayIso,
            p_to: todayIso,
            p_include_owner_metrics: true,
            p_include_internal: false
          })
        ]);

      expect(testInv?.invoice_number).toMatch(/^TEST-INV-\d{4,}$/);
      expect(testInv?.is_test).toBe(true);
      expect(Number(counterAfter?.last_number ?? 0)).toBe(realLastNumberBefore);

      // Dashboard KPIs & funnel orders_created MUST remain unchanged by the test order
      const kpisAfterConfirm = (dashAfterConfirm as { kpis: Record<string, unknown> })
        .kpis;
      const funnelAfterConfirm = (
        dashAfterConfirm as { funnel: Record<string, number> }
      ).funnel;
      expect(kpisAfterConfirm.orders_total).toBe(kpisBefore.orders_total);
      expect(kpisAfterConfirm.booked_revenue).toBe(kpisBefore.booked_revenue);
      expect(kpisAfterConfirm.collected_revenue).toBe(kpisBefore.collected_revenue);
      expect(funnelAfterConfirm.orders_created).toBe(funnelBefore.orders_created);

      const recentNumbers = (
        (dashAfterConfirm as { recent_orders?: Array<{ order_number: string }> })
          .recent_orders ?? []
      ).map(row => row.order_number);
      expect(recentNumbers).not.toContain(testOrderNumber);

      // Cancel test order -> stock restores 4 -> 5
      const cancelRes = await adminClient
        .rpc("cancel_order", {
          p_order_id: testOrderId,
          p_reason: "customer_cancelled",
          p_note: "Cleanup test order",
          p_changed_by: "r2p5-staging"
        })
        .single();
      expect(cancelRes.error).toBeNull();

      const { data: stockRestored } = await adminClient
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      expect(stockRestored?.stock_quantity).toBe(5);
    });

    it("excludes internal events by default and enforces unique whatsapp_order_sent per order_number", async () => {
      const todayIso = toNairobiDateIso(new Date());
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const uniqueOrderNumber = `AA-P5${suffix.slice(-5).toUpperCase()}`;

      const [{ data: baseExcl }, { data: baseIncl }] = await Promise.all([
        adminClient.rpc("get_analytics_dashboard", {
          p_from: todayIso,
          p_to: todayIso,
          p_include_owner_metrics: true,
          p_include_internal: false
        }),
        adminClient.rpc("get_analytics_dashboard", {
          p_from: todayIso,
          p_to: todayIso,
          p_include_owner_metrics: true,
          p_include_internal: true
        })
      ]);

      const baseExclViews = (baseExcl as { funnel: { product_views: number } }).funnel
        .product_views;
      const baseInclViews = (baseIncl as { funnel: { product_views: number } }).funnel
        .product_views;

      const { data: insertedViews, error: evErr } = await adminClient
        .from("events")
        .insert([
          {
            name: "product_view",
            session_id: `r2p5-ext-${suffix}`,
            path: "/p/test-watch",
            is_internal: false
          },
          {
            name: "product_view",
            session_id: `r2p5-int-${suffix}`,
            path: "/p/test-watch",
            is_internal: true
          }
        ])
        .select("id");
      expect(evErr).toBeNull();
      for (const row of insertedViews ?? []) {
        createdEventIds.push(row.id as string);
      }

      const [{ data: afterExcl }, { data: afterIncl }] = await Promise.all([
        adminClient.rpc("get_analytics_dashboard", {
          p_from: todayIso,
          p_to: todayIso,
          p_include_owner_metrics: true,
          p_include_internal: false
        }),
        adminClient.rpc("get_analytics_dashboard", {
          p_from: todayIso,
          p_to: todayIso,
          p_include_owner_metrics: true,
          p_include_internal: true
        })
      ]);

      expect(
        (afterExcl as { funnel: { product_views: number } }).funnel.product_views
      ).toBe(baseExclViews + 1);
      expect(
        (afterIncl as { funnel: { product_views: number } }).funnel.product_views
      ).toBe(baseInclViews + 2);

      // whatsapp_order_sent inserts once per order_number; duplicate triggers unique index violation (23505)
      const { data: firstSent, error: firstSentErr } = await adminClient
        .from("events")
        .insert({
          name: "whatsapp_order_sent",
          order_number: uniqueOrderNumber,
          session_id: `r2p5-ord-${suffix}`,
          path: "/checkout",
          is_internal: false
        })
        .select("id")
        .single();
      expect(firstSentErr).toBeNull();
      createdEventIds.push(firstSent!.id as string);

      const { error: dupSentErr } = await adminClient.from("events").insert({
        name: "whatsapp_order_sent",
        order_number: uniqueOrderNumber,
        session_id: `r2p5-ord-${suffix}`,
        path: "/checkout",
        is_internal: false
      });
      expect(dupSentErr).not.toBeNull();
      expect(dupSentErr?.code).toBe("23505");
    });
  }
);

