import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const signOutMock = vi.fn();
const cookiesGetMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookiesGetMock(name)
  })
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: () => getUserMock(),
      signOut: () => signOutMock()
    }
  }),
  createPublicServerSupabaseClient: () => ({
    from: (table: string) => fromMock(table)
  })
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (table: string) => fromMock(table)
  })
}));

describe("Round 2 Phase 3 — Owner password-only session access and order payment enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = "aura.ardoncompany@gmail.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://scukquqkdivnodefqggf.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    cookiesGetMock.mockReturnValue(undefined);
    signOutMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { role: "owner", active: true },
            error: null
          })
        })
      })
    });
  });

  it("allows owner requests in assertAdminRequest without requiring 2FA", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "owner-1",
          email: "aura.ardoncompany@gmail.com",
          app_metadata: { role: "owner" }
        }
      }
    });

    const { assertAdminRequest } = await import("@/lib/auth");
    const allowedUser = await assertAdminRequest({ requiredRole: "owner" });
    expect(allowedUser.id).toBe("owner-1");
    expect(allowedUser.adminRole).toBe("owner");
  });

  it("enriches listAdminOrders with payment and credit-note summaries from get_order_payment_summaries", async () => {
    const sampleOrder = {
      id: "ord-1",
      order_number: "AA-10001",
      status: "returned",
      order_status: "DELIVERED",
      payment_method: "CASH_ON_DELIVERY",
      payment_status: "PENDING",
      customer_name: "Amina Wanjiku",
      customer_email: null,
      customer_phone: "254712345678",
      customer_location: "Westlands",
      notes: null,
      subtotal: "4500.00",
      shipping_fee: "200.00",
      total: "4700.00",
      created_at: "2026-11-26T10:00:00Z"
    };

    fromMock.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: () => ({
            order: async () => ({ data: [sampleOrder], error: null })
          })
        };
      }
      return {
        select: () => ({
          in: async () => ({ data: [], error: null })
        })
      };
    });

    rpcMock.mockResolvedValueOnce({
      data: [
        {
          order_id: "ord-1",
          amount_paid: 0,
          credited_amount: 4700,
          credit_note_count: 1,
          invoice_status: "void"
        }
      ],
      error: null
    });

    const { listAdminOrders } = await import("@/lib/data");
    const orders = await listAdminOrders();

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      id: "ord-1",
      amount_paid: 0,
      credited_amount: 4700,
      credit_note_count: 1,
      invoice_status: "void"
    });
  });
});

