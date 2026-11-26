import { beforeEach, describe, expect, it, vi } from "vitest";

const assertAdminRequest = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();
const listRidersMock = vi.fn();
const getOrderDetailBundleMock = vi.fn();
const getDispatchSheetReportDataMock = vi.fn();
const getDeliveryMarginReportDataMock = vi.fn();

vi.mock("@/lib/auth", () => ({ assertAdminRequest }));
vi.mock("@/lib/data", () => ({
  listRiders: (...args: unknown[]) => listRidersMock(...args),
  getOrderDetailBundle: (...args: unknown[]) => getOrderDetailBundleMock(...args),
  getDispatchSheetReportData: (...args: unknown[]) =>
    getDispatchSheetReportDataMock(...args),
  getDeliveryMarginReportData: (...args: unknown[]) =>
    getDeliveryMarginReportDataMock(...args)
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
const RIDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ZONE_ID = "11111111-1111-4111-8111-111111111111";

describe("Phase 9 delivery, riders, dispatch, and margin API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertAdminRequest.mockResolvedValue({
      id: "admin-1",
      email: "aura.ardoncompany@gmail.com"
    });
  });

  it("creates riders with normalized Kenyan phone and per-zone costs, rejecting invalid phones", async () => {
    const { POST } = await import("@/app/api/admin/riders/route");

    const badPhoneRes = await POST(
      new Request("https://example.test/api/admin/riders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Brian Otieno",
          phone: "12345",
          defaultCost: 200
        })
      })
    );
    expect(badPhoneRes.status).toBe(400);

    const insertSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: RIDER_ID,
        name: "Brian Otieno",
        phone: "254712345678",
        active: true,
        default_cost: 200,
        zone_costs: { [ZONE_ID]: 150 },
        notes: "Westlands",
        created_at: "2026-05-15T08:00:00.000Z",
        updated_at: "2026-05-15T08:00:00.000Z"
      },
      error: null
    });
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({ single: insertSingleMock })
    });
    fromMock.mockReturnValue({ insert: insertMock });

    const okRes = await POST(
      new Request("https://example.test/api/admin/riders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Brian Otieno",
          phone: "0712 345 678",
          defaultCost: 200,
          zoneCosts: { [ZONE_ID]: 150 },
          notes: "Westlands"
        })
      })
    );
    const json = await okRes.json();
    expect(okRes.status).toBe(201);
    expect(json.rider.phone).toBe("254712345678");
    expect(json.rider.zone_costs).toEqual({ [ZONE_ID]: 150 });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Brian Otieno",
        phone: "254712345678",
        default_cost: 200,
        zone_costs: { [ZONE_ID]: 150 }
      })
    );
  });

  it("deactivates a rider with historical orders instead of deleting, and deletes unused riders", async () => {
    const { DELETE } = await import("@/app/api/admin/riders/[id]/route");

    // Case 1: rider has 3 past orders -> archive (active = false)
    fromMock.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: () => ({
            eq: vi.fn().mockResolvedValue({ count: 3, error: null })
          })
        };
      }
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: RIDER_ID,
                  name: "Brian Otieno",
                  phone: "254712345678",
                  active: false,
                  default_cost: 200,
                  zone_costs: {},
                  notes: null,
                  created_at: "2026-05-01T08:00:00.000Z",
                  updated_at: "2026-05-15T08:00:00.000Z"
                },
                error: null
              })
            })
          })
        })
      };
    });

    const archiveRes = await DELETE(
      new Request(`https://example.test/api/admin/riders/${RIDER_ID}`, {
        method: "DELETE"
      }),
      { params: Promise.resolve({ id: RIDER_ID }) }
    );
    const archiveJson = await archiveRes.json();
    expect(archiveRes.status).toBe(200);
    expect(archiveJson.archived).toBe(true);
    expect(archiveJson.rider.active).toBe(false);

    // Case 2: rider has 0 orders -> hard delete
    fromMock.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: () => ({
            eq: vi.fn().mockResolvedValue({ count: 0, error: null })
          })
        };
      }
      return {
        delete: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: RIDER_ID },
                error: null
              })
            })
          })
        })
      };
    });

    const deleteRes = await DELETE(
      new Request(`https://example.test/api/admin/riders/${RIDER_ID}`, {
        method: "DELETE"
      }),
      { params: Promise.resolve({ id: RIDER_ID }) }
    );
    const deleteJson = await deleteRes.json();
    expect(deleteRes.status).toBe(200);
    expect(deleteJson.deleted).toBe(true);
  });

  it("dispatches an order with rider assignment via dispatch_order RPC and returns dispatchedWhatsAppUrl", async () => {
    const { POST } = await import("@/app/api/admin/orders/[id]/status/route");

    rpcMock.mockResolvedValueOnce({
      data: { id: ORDER_ID, status: "dispatched", rider_id: RIDER_ID },
      error: null
    });
    getOrderDetailBundleMock.mockResolvedValueOnce({
      order: {
        id: ORDER_ID,
        order_number: "AA-90001",
        status: "dispatched",
        rider_id: RIDER_ID,
        rider_name: "Brian Otieno",
        rider_phone: "254711223344",
        rider_cost: "180.00"
      },
      items: [],
      history: [],
      returns: [],
      invoice: null,
      payments: [],
      creditNotes: [],
      dispatchedWhatsAppUrl:
        "https://wa.me/254712345678?text=Hi%20Amina%2C%20Brian%20Otieno%20(254711223344)"
    });

    const okRes = await POST(
      new Request(`https://example.test/api/admin/orders/${ORDER_ID}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "dispatched",
          riderId: RIDER_ID,
          riderCost: 180
        })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    const json = await okRes.json();
    expect(okRes.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("dispatch_order", {
      p_order_id: ORDER_ID,
      p_rider_id: RIDER_ID,
      p_rider_cost: 180,
      p_changed_by: "aura.ardoncompany@gmail.com",
      p_reason: null
    });
    expect(json.dispatchedWhatsAppUrl).toContain("Brian%20Otieno");

    // Inactive rider returns 409
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Selected rider is inactive." }
    });
    const inactiveRes = await POST(
      new Request(`https://example.test/api/admin/orders/${ORDER_ID}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "dispatched",
          riderId: RIDER_ID
        })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    expect(inactiveRes.status).toBe(409);
  });

  it("updates order rider and cost via PATCH /api/admin/orders/[id]/rider", async () => {
    const { PATCH } = await import("@/app/api/admin/orders/[id]/rider/route");

    rpcMock.mockResolvedValueOnce({
      data: { id: ORDER_ID, rider_id: RIDER_ID, rider_cost: 220 },
      error: null
    });
    getOrderDetailBundleMock.mockResolvedValueOnce({
      order: { id: ORDER_ID, rider_id: RIDER_ID, rider_cost: "220.00" },
      items: [],
      history: [],
      returns: [],
      invoice: null,
      payments: [],
      creditNotes: [],
      dispatchedWhatsAppUrl: null
    });

    const res = await PATCH(
      new Request(`https://example.test/api/admin/orders/${ORDER_ID}/rider`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ riderId: RIDER_ID, riderCost: 220 })
      }),
      { params: Promise.resolve({ id: ORDER_ID }) }
    );
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("assign_order_rider", {
      p_order_id: ORDER_ID,
      p_rider_id: RIDER_ID,
      p_rider_cost: 220,
      p_changed_by: "aura.ardoncompany@gmail.com"
    });
  });

  it("serves dispatch sheet JSON and delivery margin JSON + CSV reports", async () => {
    const { GET: getSheet } = await import(
      "@/app/api/admin/reports/dispatch-sheet/route"
    );
    getDispatchSheetReportDataMock.mockResolvedValueOnce({
      date: "2026-05-15",
      totalOrders: 1,
      totalAmountToCollect: 2700,
      totalRiderCost: 150,
      rows: [],
      byRider: []
    });

    const sheetRes = await getSheet(
      new Request(
        `https://example.test/api/admin/reports/dispatch-sheet?date=2026-05-15&riderId=${RIDER_ID}&includeConfirmed=true`
      )
    );
    expect(sheetRes.status).toBe(200);
    expect(getDispatchSheetReportDataMock).toHaveBeenCalledWith("2026-05-15", {
      riderId: RIDER_ID,
      includeConfirmed: true
    });

    const { GET: getMargin } = await import(
      "@/app/api/admin/reports/delivery-margin/route"
    );

    const badRangeRes = await getMargin(
      new Request(
        "https://example.test/api/admin/reports/delivery-margin?from=2026-05-20&to=2026-05-10"
      )
    );
    expect(badRangeRes.status).toBe(400);

    getDeliveryMarginReportDataMock.mockResolvedValueOnce({
      from: "2026-05-01",
      to: "2026-05-31",
      orderCount: 1,
      ordersWithRiderCost: 1,
      ordersMissingRiderCost: 0,
      totalFeesCharged: 200,
      totalRiderCosts: 150,
      netMargin: 50,
      marginPercent: 25,
      byZone: [
        {
          zoneName: "Westlands",
          orderCount: 1,
          feesCharged: 200,
          riderCosts: 150,
          margin: 50,
          marginPercent: 25
        }
      ],
      byRider: [
        {
          riderId: RIDER_ID,
          riderName: "Brian Otieno",
          riderPhone: "254711223344",
          orderCount: 1,
          feesCharged: 200,
          riderCosts: 150,
          margin: 50,
          marginPercent: 25
        }
      ],
      orders: []
    });

    const csvRes = await getMargin(
      new Request(
        "https://example.test/api/admin/reports/delivery-margin?from=2026-05-01&to=2026-05-31&format=csv"
      )
    );
    const csvText = await csvRes.text();
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("Content-Type")).toContain("text/csv");
    expect(csvText).toContain("Westlands");
    expect(csvText).toContain("50.00");
  });
});

