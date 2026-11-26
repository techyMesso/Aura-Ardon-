import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Customer, CustomerDetailBundle } from "@/lib/types";

const assertAdminRequest = vi.fn();
const listAdminCustomersMock = vi.fn();
const getCustomerDetailBundleMock = vi.fn();
const listOptedInCustomersMock = vi.fn();
const fromMock = vi.fn();
const rpcSingleMock = vi.fn();

vi.mock("@/lib/auth", () => ({ assertAdminRequest }));
vi.mock("@/lib/data", () => ({
  listAdminCustomers: (...args: unknown[]) => listAdminCustomersMock(...args),
  getCustomerDetailBundle: (...args: unknown[]) =>
    getCustomerDetailBundleMock(...args),
  listOptedInCustomers: (...args: unknown[]) =>
    listOptedInCustomersMock(...args)
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => fromMock(table),
    rpc: (fn: string, params: unknown) => ({
      single: () => rpcSingleMock(fn, params)
    })
  })
}));

const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: CUSTOMER_ID,
    phone: "254712345678",
    full_name: "Grace Njeri",
    names_used: ["Grace Njeri"],
    addresses_used: ["Kilimani, Yaya"],
    zones_used: ["Kilimani"],
    last_zone: "Kilimani",
    last_address: "Kilimani, Yaya",
    marketing_opt_in: true,
    marketing_opt_in_at: "2026-11-20T09:00:00.000Z",
    notes: null,
    tags: [],
    is_flagged: false,
    is_blocked: false,
    order_count: 2,
    cancelled_count: 0,
    lifetime_value: 7400,
    last_order_at: "2026-11-24T11:00:00.000Z",
    anonymized_at: null,
    created_at: "2026-11-01T08:00:00.000Z",
    updated_at: "2026-11-24T11:00:00.000Z",
    ...overrides
  };
}

function makeBundle(overrides: Partial<Customer> = {}): CustomerDetailBundle {
  return {
    customer: makeCustomer(overrides),
    orders: [],
    invoices: []
  };
}

describe("Phase 7 admin customers CRM routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertAdminRequest.mockResolvedValue({
      id: "admin-1",
      email: "aura.ardoncompany@gmail.com"
    });
  });

  it("lists customers with filter and search query params", async () => {
    const customer = makeCustomer({ tags: ["VIP"] });
    listAdminCustomersMock.mockResolvedValueOnce([customer]);

    const { GET } = await import("@/app/api/admin/customers/route");
    const res = await GET(
      new Request(
        "https://aura-ardon.vercel.app/api/admin/customers?filter=vip&search=Grace"
      )
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.customers).toHaveLength(1);
    expect(listAdminCustomersMock).toHaveBeenCalledWith({
      filter: "vip",
      search: "Grace"
    });
  });

  it("updates notes, normalized tags, flag, and block status on active customers", async () => {
    getCustomerDetailBundleMock.mockResolvedValueOnce(makeBundle());

    const updatedCustomer = makeCustomer({
      notes: "Frequent no-show in Westlands",
      tags: ["VIP", "Repeat"],
      is_flagged: true,
      is_blocked: false
    });
    const updatePayloadSpy = vi.fn();
    fromMock.mockReturnValueOnce({
      update: (payload: unknown) => {
        updatePayloadSpy(payload);
        return {
          eq: () => ({
            select: () => ({
              single: vi.fn().mockResolvedValue({
                data: updatedCustomer,
                error: null
              })
            })
          })
        };
      }
    });

    const { PATCH } = await import("@/app/api/admin/customers/[id]/route");
    const res = await PATCH(
      new Request(
        `https://aura-ardon.vercel.app/api/admin/customers/${CUSTOMER_ID}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            notes: "  Frequent no-show in Westlands  ",
            tags: [" VIP ", "vip", "Repeat"],
            isFlagged: true,
            isBlocked: false
          })
        }
      ),
      { params: Promise.resolve({ id: CUSTOMER_ID }) }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updatePayloadSpy).toHaveBeenCalledWith({
      notes: "Frequent no-show in Westlands",
      tags: ["VIP", "Repeat"],
      is_flagged: true,
      is_blocked: false
    });
  });

  it("rejects PATCH edits with 409 on anonymized customer records", async () => {
    getCustomerDetailBundleMock.mockResolvedValueOnce(
      makeBundle({
        phone: "ANON-666666666666",
        full_name: "Deleted Customer",
        anonymized_at: "2026-11-26T10:00:00.000Z"
      })
    );

    const { PATCH } = await import("@/app/api/admin/customers/[id]/route");
    const res = await PATCH(
      new Request(
        `https://aura-ardon.vercel.app/api/admin/customers/${CUSTOMER_ID}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ notes: "Try editing" })
        }
      ),
      { params: Promise.resolve({ id: CUSTOMER_ID }) }
    );

    expect(res.status).toBe(409);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("requires explicit ANONYMIZE confirmation and invokes anonymize_customer RPC", async () => {
    const { POST } = await import(
      "@/app/api/admin/customers/[id]/anonymize/route"
    );

    const badRes = await POST(
      new Request(
        `https://aura-ardon.vercel.app/api/admin/customers/${CUSTOMER_ID}/anonymize`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirm: "yes" })
        }
      ),
      { params: Promise.resolve({ id: CUSTOMER_ID }) }
    );
    expect(badRes.status).toBe(400);
    expect(rpcSingleMock).not.toHaveBeenCalled();

    rpcSingleMock.mockResolvedValueOnce({
      data: {
        customer_id: CUSTOMER_ID,
        anonymized_ref: "ANON-666666666666",
        orders_anonymized: 2,
        invoices_anonymized: 1,
        already_anonymized: false
      },
      error: null
    });
    getCustomerDetailBundleMock.mockResolvedValueOnce(
      makeBundle({
        phone: "ANON-666666666666",
        full_name: "Deleted Customer",
        anonymized_at: "2026-11-26T12:00:00.000Z"
      })
    );

    const okRes = await POST(
      new Request(
        `https://aura-ardon.vercel.app/api/admin/customers/${CUSTOMER_ID}/anonymize`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirm: "ANONYMIZE" })
        }
      ),
      { params: Promise.resolve({ id: CUSTOMER_ID }) }
    );
    const json = await okRes.json();

    expect(okRes.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.anonymizedRef).toBe("ANON-666666666666");
    expect(json.ordersAnonymized).toBe(2);
    expect(json.invoicesAnonymized).toBe(1);
    expect(rpcSingleMock).toHaveBeenCalledWith("anonymize_customer", {
      p_customer_id: CUSTOMER_ID,
      p_actor: "aura.ardoncompany@gmail.com"
    });
  });

  it("exports CSV containing only opted-in, non-blocked, non-anonymized customers", async () => {
    listOptedInCustomersMock.mockResolvedValueOnce([
      makeCustomer({
        phone: "254712345678",
        full_name: "Grace Njeri",
        marketing_opt_in: true
      }),
      makeCustomer({
        id: "77777777-7777-4777-8777-777777777777",
        phone: "254799999999",
        full_name: "Opted Out Person",
        marketing_opt_in: false
      })
    ]);

    const { GET } = await import("@/app/api/admin/customers/export/route");
    const res = await GET();
    const csv = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(
      "auro-ardon-opted-in-customers.csv"
    );
    expect(csv).toContain("254712345678");
    expect(csv).toContain("Grace Njeri");
    expect(csv).not.toContain("Opted Out Person");
  });
});

