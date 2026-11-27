import fs from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertAdminRequest,
  mockRecordAuditLog,
  mockRevalidateDeliveryZones,
  mockListAdminDeliveryZonesWithCounts,
  mockSendAdminTestAlert,
  mockCreateAdminSupabaseClient
} = vi.hoisted(() => ({
  mockAssertAdminRequest: vi.fn(),
  mockRecordAuditLog: vi.fn(),
  mockRevalidateDeliveryZones: vi.fn(),
  mockListAdminDeliveryZonesWithCounts: vi.fn(),
  mockSendAdminTestAlert: vi.fn(),
  mockCreateAdminSupabaseClient: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  assertAdminRequest: mockAssertAdminRequest
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: mockRecordAuditLog
}));

vi.mock("@/lib/cache", () => ({
  revalidateDeliveryZones: mockRevalidateDeliveryZones
}));

vi.mock("@/lib/data", () => ({
  listAdminDeliveryZonesWithCounts: mockListAdminDeliveryZonesWithCounts
}));

vi.mock("@/lib/notifications", () => ({
  sendAdminTestAlert: mockSendAdminTestAlert
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mockCreateAdminSupabaseClient
}));

import {
  GET as getZones,
  POST as createZone
} from "@/app/api/admin/delivery-zones/route";
import {
  DELETE as deleteZone,
  PATCH as patchZone
} from "@/app/api/admin/delivery-zones/[id]/route";
import { POST as reorderZones } from "@/app/api/admin/delivery-zones/reorder/route";
import { POST as sendTestAlert } from "@/app/api/admin/notifications/test/route";

const OWNER_USER = {
  id: "owner-1",
  email: "owner@example.com",
  role: "owner" as const
};

const ZONE_A_ID = "14630fbd-15db-40b7-824e-b0fd83086f3b";
const ZONE_B_ID = "51f69b61-5f6b-4223-8462-d3e6bbd0d892";

describe("Round 2 Phase 1 — Test alert & delivery zone admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertAdminRequest.mockResolvedValue(OWNER_USER);
    mockRecordAuditLog.mockResolvedValue(undefined);
  });

  it("enforces owner-only role on POST /api/admin/notifications/test and reports per-channel results", async () => {
    mockAssertAdminRequest.mockRejectedValueOnce(new Error("FORBIDDEN"));

    const denied = await sendTestAlert();
    expect(denied.status).toBe(403);
    expect(mockAssertAdminRequest).toHaveBeenCalledWith({ requiredRole: "owner" });

    mockSendAdminTestAlert.mockResolvedValueOnce({
      ok: true,
      email: {
        configured: true,
        toEmail: "owner@example.com",
        sent: true,
        skipped: false,
        id: "re_test_1"
      },
      push: {
        configured: true,
        deviceCount: 0,
        sent: 0,
        failed: 0,
        deactivated: 0,
        skipped: true,
        error: "No subscribed push devices yet."
      }
    });

    const okRes = await sendTestAlert();
    expect(okRes.status).toBe(200);
    const okBody = (await okRes.json()) as { ok: boolean; email: { sent: boolean } };
    expect(okBody.ok).toBe(true);
    expect(okBody.email.sent).toBe(true);
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "notifications.test_alert_sent",
        entity: "notification"
      })
    );

    mockSendAdminTestAlert.mockResolvedValueOnce({
      ok: false,
      email: {
        configured: true,
        toEmail: "owner@example.com",
        sent: false,
        skipped: false,
        error: "Resend HTTP 403: Domain not verified"
      },
      push: {
        configured: false,
        deviceCount: 0,
        sent: 0,
        failed: 0,
        deactivated: 0,
        skipped: true,
        error: "Web Push is not configured."
      }
    });

    const failRes = await sendTestAlert();
    expect(failRes.status).toBe(502);
    const failBody = (await failRes.json()) as { ok: boolean; error: string };
    expect(failBody.ok).toBe(false);
    expect(failBody.error).toContain("Resend HTTP 403: Domain not verified");
  });

  it("blocks staff users on every delivery-zone endpoint", async () => {
    mockAssertAdminRequest.mockRejectedValue(new Error("FORBIDDEN"));

    const resGet = await getZones();
    const resPost = await createZone(
      new Request("http://localhost/api/admin/delivery-zones", {
        method: "POST",
        body: JSON.stringify({ name: "Gigiri", fee: 300 })
      })
    );
    const resPatch = await patchZone(
      new Request(`http://localhost/api/admin/delivery-zones/${ZONE_A_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ fee: 350 })
      }),
      { params: Promise.resolve({ id: ZONE_A_ID }) }
    );
    const resDelete = await deleteZone(
      new Request(`http://localhost/api/admin/delivery-zones/${ZONE_A_ID}`, {
        method: "DELETE"
      }),
      { params: Promise.resolve({ id: ZONE_A_ID }) }
    );
    const resReorder = await reorderZones(
      new Request("http://localhost/api/admin/delivery-zones/reorder", {
        method: "POST",
        body: JSON.stringify({ orderedIds: [ZONE_B_ID, ZONE_A_ID] })
      })
    );

    expect(resGet.status).toBe(403);
    expect(resPost.status).toBe(403);
    expect(resPatch.status).toBe(403);
    expect(resDelete.status).toBe(403);
    expect(resReorder.status).toBe(403);

    for (const call of mockAssertAdminRequest.mock.calls) {
      expect(call[0]).toEqual({ requiredRole: "owner" });
    }
  });

  it("validates fee range, trims unique names, creates a zone, audits, and revalidates", async () => {
    const existingZones = [
      { id: ZONE_A_ID, name: "Westlands", sort_order: 1 }
    ];
    const createdRow = {
      id: ZONE_B_ID,
      name: "Gigiri",
      fee: 350,
      active: true,
      sort_order: 2,
      is_outside_nairobi: false,
      created_at: "2026-11-27T00:00:00.000Z",
      updated_at: "2026-11-27T00:00:00.000Z"
    };

    const mockInsertSingle = vi.fn().mockResolvedValue({
      data: createdRow,
      error: null
    });

    mockCreateAdminSupabaseClient.mockReturnValue({
      from: (table: string) => {
        expect(table).toBe("delivery_zones");
        return {
          select: () => Promise.resolve({ data: existingZones, error: null }),
          insert: () => ({
            select: () => ({
              single: mockInsertSingle
            })
          })
        };
      }
    });

    // Rejects non-integer fee
    const badFeeRes = await createZone(
      new Request("http://localhost/api/admin/delivery-zones", {
        method: "POST",
        body: JSON.stringify({ name: "Gigiri", fee: 250.5 })
      })
    );
    expect(badFeeRes.status).toBe(400);

    // Rejects case-insensitive duplicate name
    const dupRes = await createZone(
      new Request("http://localhost/api/admin/delivery-zones", {
        method: "POST",
        body: JSON.stringify({ name: "  westlands  ", fee: 200 })
      })
    );
    expect(dupRes.status).toBe(409);

    // Succeeds for valid zone
    const okRes = await createZone(
      new Request("http://localhost/api/admin/delivery-zones", {
        method: "POST",
        body: JSON.stringify({ name: "  Gigiri  ", fee: 350 })
      })
    );
    expect(okRes.status).toBe(201);
    const body = (await okRes.json()) as { zone: { name: string; fee: number } };
    expect(body.zone.name).toBe("Gigiri");
    expect(body.zone.fee).toBe(350);

    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery_zone.created",
        entity: "delivery_zone",
        entityId: ZONE_B_ID,
        before: null,
        after: expect.objectContaining({ name: "Gigiri", fee: 350 })
      })
    );
    expect(mockRevalidateDeliveryZones).toHaveBeenCalledTimes(1);
  });

  it("updates a zone fee without mutating orders or invoices, logs before/after, and revalidates", async () => {
    const beforeZone = {
      id: ZONE_A_ID,
      name: "Westlands",
      fee: 200,
      active: true,
      sort_order: 1,
      is_outside_nairobi: false,
      created_at: "2026-11-26T00:00:00.000Z",
      updated_at: "2026-11-26T00:00:00.000Z"
    };
    const afterZone = {
      ...beforeZone,
      fee: 450,
      updated_at: "2026-11-27T01:00:00.000Z"
    };

    const mutatedTables: string[] = [];

    mockCreateAdminSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === "delivery_zones") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: beforeZone, error: null })
              })
            }),
            update: () => {
              mutatedTables.push(table);
              return {
                eq: () => ({
                  select: () => ({
                    single: () =>
                      Promise.resolve({ data: afterZone, error: null })
                  })
                })
              };
            }
          };
        }
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ count: 3, error: null })
            })
          };
        }
        throw new Error(`Unexpected table touched: ${table}`);
      }
    });

    const res = await patchZone(
      new Request(`http://localhost/api/admin/delivery-zones/${ZONE_A_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ fee: 450 })
      }),
      { params: Promise.resolve({ id: ZONE_A_ID }) }
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      zone: { fee: number; order_count: number };
    };
    expect(body.zone.fee).toBe(450);
    expect(body.zone.order_count).toBe(3);

    // Must ONLY mutate delivery_zones, never orders or invoices
    expect(mutatedTables).toEqual(["delivery_zones"]);

    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery_zone.updated",
        entity: "delivery_zone",
        entityId: ZONE_A_ID,
        before: expect.objectContaining({ fee: 200 }),
        after: expect.objectContaining({ fee: 450 })
      })
    );
    expect(mockRevalidateDeliveryZones).toHaveBeenCalledTimes(1);
  });

  it("refuses to hard-delete a delivery zone referenced by orders (HTTP 409)", async () => {
    const existingZone = {
      id: ZONE_A_ID,
      name: "Westlands",
      fee: 200,
      active: true,
      sort_order: 1,
      is_outside_nairobi: false,
      created_at: "2026-11-26T00:00:00.000Z",
      updated_at: "2026-11-26T00:00:00.000Z"
    };

    const deleteSpy = vi.fn();

    mockCreateAdminSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === "delivery_zones") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: existingZone, error: null })
              })
            }),
            delete: deleteSpy
          };
        }
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ count: 2, error: null })
            })
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }
    });

    const res = await deleteZone(
      new Request(`http://localhost/api/admin/delivery-zones/${ZONE_A_ID}`, {
        method: "DELETE"
      }),
      { params: Promise.resolve({ id: ZONE_A_ID }) }
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("ZONE_REFERENCED_BY_ORDERS");
    expect(body.error).toMatch(/deactivate it instead/i);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("reorders delivery zones, logs before/after order in audit_log, and revalidates", async () => {
    const initialRows = [
      { id: ZONE_A_ID, name: "Westlands", sort_order: 1 },
      { id: ZONE_B_ID, name: "Kilimani", sort_order: 2 }
    ];
    const updates: Array<{ id: string; sort_order: number }> = [];

    mockCreateAdminSupabaseClient.mockReturnValue({
      from: () => ({
        select: () => ({
          order: () => ({
            order: () => Promise.resolve({ data: initialRows, error: null })
          })
        }),
        update: (patch: { sort_order: number }) => ({
          eq: (_col: string, id: string) => {
            updates.push({ id, sort_order: patch.sort_order });
            return Promise.resolve({ error: null });
          }
        })
      })
    });

    mockListAdminDeliveryZonesWithCounts.mockResolvedValueOnce([
      {
        id: ZONE_B_ID,
        name: "Kilimani",
        fee: 200,
        active: true,
        sort_order: 1,
        is_outside_nairobi: false,
        created_at: "",
        updated_at: "",
        order_count: 0
      },
      {
        id: ZONE_A_ID,
        name: "Westlands",
        fee: 200,
        active: true,
        sort_order: 2,
        is_outside_nairobi: false,
        created_at: "",
        updated_at: "",
        order_count: 1
      }
    ]);

    const res = await reorderZones(
      new Request("http://localhost/api/admin/delivery-zones/reorder", {
        method: "POST",
        body: JSON.stringify({ orderedIds: [ZONE_B_ID, ZONE_A_ID] })
      })
    );

    expect(res.status).toBe(200);
    expect(updates).toEqual([
      { id: ZONE_B_ID, sort_order: 1 },
      { id: ZONE_A_ID, sort_order: 2 }
    ]);
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery_zone.reordered",
        entity: "delivery_zone",
        before: [
          { id: ZONE_A_ID, name: "Westlands", sort_order: 1 },
          { id: ZONE_B_ID, name: "Kilimani", sort_order: 2 }
        ],
        after: [
          { id: ZONE_B_ID, name: "Kilimani", sort_order: 1 },
          { id: ZONE_A_ID, name: "Westlands", sort_order: 2 }
        ]
      })
    );
    expect(mockRevalidateDeliveryZones).toHaveBeenCalledTimes(1);
  });

  it("verifies Round 2 Phase 1 migration enforces owner-only RLS, fee constraints, and delete trigger", () => {
    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261127010000_round2_phase1_delivery_zones.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("delivery_zones_name_lower_uidx");
    expect(sql).toContain("delivery_zones_fee_integer_range_check");
    expect(sql).toContain("fee >= 0 and fee <= 10000 and fee = trunc(fee)");
    expect(sql).toContain("prevent_referenced_delivery_zone_delete");
    expect(sql).toContain("Owner can insert delivery zones");
    expect(sql).toContain("Owner can update delivery zones");
    expect(sql).toContain("Owner can delete delivery zones");
    expect(sql).toContain("private.is_owner()");
  });
});

// Live Staging DB test proving fee edits never mutate existing orders or invoices,
// and hard-deleting a referenced zone is blocked at the Postgres trigger level.
const PROD_PROJECT_REF = "bjasoyhcxubrkxrqurfr";
const RUN_STAGING_DB_TESTS = process.env.RUN_STAGING_DB_TESTS === "1";
const STAGING_URL =
  process.env.STAGING_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const STAGING_SERVICE_KEY =
  process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";

describe.runIf(RUN_STAGING_DB_TESTS)(
  "Round 2 Phase 1 live staging-DB — fee snapshot immutability & delete guard",
  () => {
    let adminClient: SupabaseClient;
    let tempZoneId: string | null = null;
    let tempCategoryId: string | null = null;
    let tempProductId: string | null = null;
    let tempOrderId: string | null = null;

    beforeAll(() => {
      if (STAGING_URL.includes(PROD_PROJECT_REF)) {
        throw new Error(
          "Refusing to run Round 2 Phase 1 staging test against production."
        );
      }
      adminClient = createClient(STAGING_URL, STAGING_SERVICE_KEY, {
        auth: { persistSession: false }
      });
    });

    afterAll(async () => {
      if (tempOrderId) {
        const { data: invs } = await adminClient
          .from("invoices")
          .select("id")
          .eq("order_id", tempOrderId);
        const invIds = (invs ?? []).map(row => row.id as string);
        if (invIds.length > 0) {
          await adminClient.from("payments").delete().in("invoice_id", invIds);
          await adminClient.from("credit_notes").delete().in("invoice_id", invIds);
          await adminClient.from("invoices").delete().in("id", invIds);
        }
        await adminClient
          .from("order_status_history")
          .delete()
          .eq("order_id", tempOrderId);
        await adminClient.from("stock_movements").delete().eq("order_id", tempOrderId);
        await adminClient.from("order_items").delete().eq("order_id", tempOrderId);
        await adminClient.from("orders").delete().eq("id", tempOrderId);
      }
      if (tempProductId) {
        await adminClient
          .from("stock_movements")
          .delete()
          .eq("product_id", tempProductId);
        await adminClient.from("products").delete().eq("id", tempProductId);
      }
      if (tempCategoryId) {
        await adminClient.from("categories").delete().eq("id", tempCategoryId);
      }
      if (tempZoneId) {
        await adminClient.from("delivery_zones").delete().eq("id", tempZoneId);
      }
    });

    it("preserves existing order and invoice delivery fee snapshots when a zone fee is edited, and blocks deleting referenced zones", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const { data: zone, error: zoneErr } = await adminClient
        .from("delivery_zones")
        .insert({
          name: `R2P1 Zone ${suffix}`,
          fee: 350,
          active: true,
          sort_order: 999,
          is_outside_nairobi: false
        })
        .select("id, fee")
        .single();
      expect(zoneErr).toBeNull();
      tempZoneId = zone!.id as string;

      const { data: cat } = await adminClient
        .from("categories")
        .insert({
          name: `R2P1 Cat ${suffix}`,
          slug: `r2p1-cat-${suffix}`,
          description: "Round 2 Phase 1 test category",
          display_order: 999,
          active: true
        })
        .select("id")
        .single();
      tempCategoryId = cat!.id as string;

      const { data: prod } = await adminClient
        .from("products")
        .insert({
          title: `R2P1 Watch ${suffix}`,
          slug: `r2p1-watch-${suffix}`,
          description: "Round 2 Phase 1 test watch",
          category: "Watches",
          category_id: tempCategoryId,
          price: 2500,
          stock_quantity: 5,
          images: ["https://example.com/watch.jpg"],
          active: true,
          status: "active"
        })
        .select("id")
        .single();
      tempProductId = prod!.id as string;

      const { data: placed, error: placeErr } = await adminClient
        .rpc("place_order", {
          p_customer_name: "Zone Snapshot Buyer",
          p_customer_phone: "254712300301",
          p_delivery_zone_id: tempZoneId,
          p_delivery_address: "Test Plaza",
          p_town_county: null,
          p_notes: null,
          p_is_gift: false,
          p_gift_note: null,
          p_hide_prices: false,
          p_marketing_opt_in: false,
          p_discount_code: null,
          p_discount_amount: 0,
          p_idempotency_key: `r2p1-snap-${suffix}`,
          p_items: [{ product_id: tempProductId, quantity: 1 }]
        })
        .single();
      expect(placeErr).toBeNull();
      tempOrderId = (placed as { order_id: string }).order_id;

      // Confirm order to auto-issue invoice with delivery fee snapshot = 350
      const confirmRes = await adminClient.rpc("set_order_status", {
        p_order_id: tempOrderId,
        p_to_status: "confirmed",
        p_changed_by: "r2p1-test",
        p_reason: "Snapshot verification"
      });
      expect(confirmRes.error).toBeNull();

      // Update delivery zone fee from 350 -> 750
      const { error: updateErr } = await adminClient
        .from("delivery_zones")
        .update({ fee: 750 })
        .eq("id", tempZoneId);
      expect(updateErr).toBeNull();

      // Existing order and invoice MUST keep original fee snapshot (350)
      const [{ data: orderAfter }, { data: invoiceAfter }] = await Promise.all([
        adminClient
          .from("orders")
          .select("shipping_fee, total")
          .eq("id", tempOrderId)
          .single(),
        adminClient
          .from("invoices")
          .select("delivery_fee, total")
          .eq("order_id", tempOrderId)
          .single()
      ]);

      expect(Number(orderAfter?.shipping_fee)).toBe(350);
      expect(Number(orderAfter?.total)).toBe(2850);
      expect(Number(invoiceAfter?.delivery_fee)).toBe(350);
      expect(Number(invoiceAfter?.total)).toBe(2850);

      // Attempting to hard-delete the referenced zone MUST fail at Postgres trigger level
      const { error: deleteErr } = await adminClient
        .from("delivery_zones")
        .delete()
        .eq("id", tempZoneId);
      expect(deleteErr).not.toBeNull();
      expect(deleteErr?.message).toMatch(/referenced by existing orders/i);
    });
  }
);

