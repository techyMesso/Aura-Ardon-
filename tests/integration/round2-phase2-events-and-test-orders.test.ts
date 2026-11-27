import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertAdminRequest,
  mockRecordAuditLog,
  mockGetOrderDetailBundle,
  mockGetAnalyticsDashboardData,
  mockCheckRateLimit,
  mockFrom,
  mockRpc
} = vi.hoisted(() => ({
  mockAssertAdminRequest: vi.fn(),
  mockRecordAuditLog: vi.fn(),
  mockGetOrderDetailBundle: vi.fn(),
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

vi.mock("@/lib/data", () => ({
  getOrderDetailBundle: mockGetOrderDetailBundle,
  getAnalyticsDashboardData: mockGetAnalyticsDashboardData
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => mockFrom(table),
    rpc: (...args: unknown[]) => mockRpc(...args)
  })
}));

import { GET as getAnalytics } from "@/app/api/admin/analytics/route";
import { POST as clearEvents } from "@/app/api/admin/events/clear/route";
import { PATCH as toggleOrderTest } from "@/app/api/admin/orders/[id]/test/route";
import { POST as trackEvent } from "@/app/api/events/route";
import { buildEmptyAnalyticsDashboardReport } from "@/lib/analytics";

const OWNER_USER = {
  id: "owner-1",
  email: "aura.ardoncompany@gmail.com",
  app_metadata: { role: "owner" }
};

const ORDER_ID = "44444444-4444-4444-8444-444444444444";

describe("Round 2 Phase 2 — Events accuracy, internal traffic, clear events & test orders APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = "aura.ardoncompany@gmail.com";
    mockAssertAdminRequest.mockResolvedValue(OWNER_USER);
    mockRecordAuditLog.mockResolvedValue(undefined);
    mockCheckRateLimit.mockResolvedValue({
      ok: true,
      limit: 60,
      remaining: 59,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0
    });
  });

  it("drops /admin events, marks aa_internal=1 events internal, requires orderNumber on whatsapp_order_sent, and dedupes both begin_checkout and whatsapp_order_sent", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({ limit: limitMock }),
            limit: limitMock
          })
        })
      }),
      insert: insertMock
    });

    // 1. Admin paths are never tracked
    const adminRes = await trackEvent(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Safari/604.1"
        },
        body: JSON.stringify({
          name: "product_view",
          sessionId: "anon-session-12345",
          path: "/admin/orders"
        })
      })
    );
    expect(adminRes.status).toBe(202);
    expect(insertMock).not.toHaveBeenCalled();

    // 2. Internal cookie flags is_internal = true
    const internalRes = await trackEvent(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Safari/604.1",
          cookie: "aa_internal=1"
        },
        body: JSON.stringify({
          name: "product_view",
          sessionId: "anon-session-12345",
          path: "/p/watch"
        })
      })
    );
    expect(internalRes.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "product_view",
        is_internal: true
      })
    );

    // 3. whatsapp_order_sent without orderNumber is rejected (400)
    const missingOrderNumRes = await trackEvent(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Safari/604.1"
        },
        body: JSON.stringify({
          name: "whatsapp_order_sent",
          sessionId: "anon-session-12345",
          path: "/checkout"
        })
      })
    );
    expect(missingOrderNumRes.status).toBe(400);

    // 4. First whatsapp_order_sent with orderNumber inserts; second with same orderNumber dedupes
    insertMock.mockClear();
    const sent1 = await trackEvent(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Safari/604.1"
        },
        body: JSON.stringify({
          name: "whatsapp_order_sent",
          orderNumber: "aa-7f3k2",
          sessionId: "anon-session-12345",
          path: "/checkout"
        })
      })
    );
    expect(sent1.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "whatsapp_order_sent",
        order_number: "AA-7F3K2"
      })
    );

    insertMock.mockClear();
    limitMock.mockResolvedValueOnce({ data: [{ id: "existing-ev" }], error: null });
    const sentDup = await trackEvent(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Safari/604.1"
        },
        body: JSON.stringify({
          name: "whatsapp_order_sent",
          orderNumber: "AA-7F3K2",
          sessionId: "anon-session-12345",
          path: "/checkout"
        })
      })
    );
    expect(sentDup.status).toBe(200);
    expect(insertMock).not.toHaveBeenCalled();

    // 5. begin_checkout within 30 minutes dedupes without inserting
    limitMock.mockResolvedValueOnce({ data: [{ id: "recent-bc" }], error: null });
    const bcDup = await trackEvent(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Safari/604.1"
        },
        body: JSON.stringify({
          name: "begin_checkout",
          sessionId: "anon-session-12345",
          path: "/checkout"
        })
      })
    );
    expect(bcDup.status).toBe(200);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("enforces owner-only role on POST /api/admin/events/clear and logs to audit_log", async () => {
    mockAssertAdminRequest.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const denied = await clearEvents(
      new Request("https://aura-ardon.vercel.app/api/admin/events/clear", {
        method: "POST",
        body: JSON.stringify({ beforeDate: "2026-11-27" })
      })
    );
    expect(denied.status).toBe(403);

    const ltMock = vi.fn().mockResolvedValue({ count: 14, error: null });
    mockFrom.mockReturnValue({
      delete: () => ({ lt: ltMock })
    });

    const okRes = await clearEvents(
      new Request("https://aura-ardon.vercel.app/api/admin/events/clear", {
        method: "POST",
        body: JSON.stringify({ beforeDate: "2026-11-27" })
      })
    );
    expect(okRes.status).toBe(200);
    const body = (await okRes.json()) as { deletedCount: number };
    expect(body.deletedCount).toBe(14);
    expect(ltMock).toHaveBeenCalledWith("created_at", "2026-11-27T00:00:00.000+03:00");
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "events.cleared_before_date",
        entity: "analytics_events"
      })
    );
  });

  it("forwards includeInternal=1 to getAnalyticsDashboardData when toggled on", async () => {
    mockGetAnalyticsDashboardData.mockResolvedValueOnce(
      buildEmptyAnalyticsDashboardReport("2026-11-01", "2026-11-27", true)
    );

    const res = await getAnalytics(
      new Request(
        "https://aura-ardon.vercel.app/api/admin/analytics?preset=custom&from=2026-11-01&to=2026-11-27&includeInternal=1"
      )
    );
    expect(res.status).toBe(200);
    expect(mockGetAnalyticsDashboardData).toHaveBeenCalledWith({
      from: "2026-11-01",
      to: "2026-11-27",
      includeOwnerMetrics: true,
      includeInternal: true
    });
  });

  it("enforces owner-only and pending-only guards on PATCH /api/admin/orders/[id]/test and audits toggle", async () => {
    mockAssertAdminRequest.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const denied = await toggleOrderTest(
      new Request(`https://aura-ardon.vercel.app/api/admin/orders/${ORDER_ID}/test`, {
        method: "PATCH",
        body: JSON.stringify({ isTest: true })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    expect(denied.status).toBe(403);

    // Rejects confirmed order with 409
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: ORDER_ID,
                order_number: "AA-10001",
                status: "confirmed",
                is_test: false,
                customer_name: "Amina"
              },
              error: null
            })
        })
      })
    });

    const nonPendingRes = await toggleOrderTest(
      new Request(`https://aura-ardon.vercel.app/api/admin/orders/${ORDER_ID}/test`, {
        method: "PATCH",
        body: JSON.stringify({ isTest: true })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    expect(nonPendingRes.status).toBe(409);

    // Succeeds for pending order
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: ORDER_ID,
                order_number: "AA-10001",
                status: "pending",
                is_test: false,
                customer_name: "Amina"
              },
              error: null
            })
        })
      })
    });
    mockRpc.mockReturnValueOnce({
      single: () => Promise.resolve({ data: { id: ORDER_ID, is_test: true }, error: null })
    });
    mockGetOrderDetailBundle.mockResolvedValueOnce({
      order: { id: ORDER_ID, order_number: "AA-10001", status: "pending", is_test: true },
      items: []
    });

    const okRes = await toggleOrderTest(
      new Request(`https://aura-ardon.vercel.app/api/admin/orders/${ORDER_ID}/test`, {
        method: "PATCH",
        body: JSON.stringify({ isTest: true })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    expect(okRes.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("set_order_is_test", {
      p_order_id: ORDER_ID,
      p_is_test: true
    });
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.marked_as_test",
        entity: "order",
        entityId: ORDER_ID,
        before: { order_number: "AA-10001", is_test: false },
        after: { order_number: "AA-10001", is_test: true }
      })
    );
  });

  it("verifies Phase 2 SQL migration defines internal flag, order dedupe index, TEST-INV counter, and analytics exclusions", () => {
    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261127020000_round2_phase2_analytics_and_test_orders.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("add column if not exists is_internal");
    expect(sql).toContain("events_whatsapp_order_sent_order_number_uidx");
    expect(sql).toContain("add column if not exists is_test");
    expect(sql).toContain("next_test_invoice_number");
    expect(sql).toContain("'TEST-INV-'");
    expect(sql).toContain("set_order_is_test");
    expect(sql).toContain("is_test_order_customer_name");
    expect(sql).toContain("coalesce(o.is_test, false) = false");
    expect(sql).toContain("coalesce(e.is_internal, false) = false");
    expect(sql).toContain("'orders_created', ord.orders_created");
  });
});

