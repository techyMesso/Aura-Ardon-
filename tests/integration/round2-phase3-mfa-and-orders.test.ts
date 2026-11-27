import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUserMock = vi.fn();
const signOutMock = vi.fn();
const getAalMock = vi.fn();
const listFactorsMock = vi.fn();
const cookiesGetMock = vi.fn();
const checkRateLimitMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();
const recordAuditLogMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookiesGetMock(name)
  })
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: () => getUserMock(),
      signOut: () => signOutMock(),
      mfa: {
        getAuthenticatorAssuranceLevel: () => getAalMock(),
        listFactors: () => listFactorsMock()
      }
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

vi.mock("@/lib/rate-limit", () => ({
  getClientIp: () => "196.201.214.90",
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args)
}));

vi.mock("@/lib/audit", () => ({
  recordAuditLog: (...args: unknown[]) => recordAuditLogMock(...args)
}));

describe("Round 2 Phase 3 — Owner MFA skip enforcement, status route, and order payment enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = "aura.ardoncompany@gmail.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://scukquqkdivnodefqggf.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    process.env.OWNER_MFA_REQUIRED = "false";

    cookiesGetMock.mockReturnValue(undefined);
    signOutMock.mockResolvedValue({ error: null });
    getAalMock.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null
    });
    listFactorsMock.mockResolvedValue({
      data: { totp: [] },
      error: null
    });
    checkRateLimitMock.mockResolvedValue({
      ok: true,
      limit: 20,
      remaining: 19,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0
    });
    recordAuditLogMock.mockResolvedValue(undefined);
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { role: "owner", active: true, mfa_skip_count: 0 },
            error: null
          })
        })
      })
    });
  });

  it("allows owner to skip up to 3 times, logs audit trail, sets session cookie, and rejects the 4th skip with HTTP 403", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "owner-1",
          email: "aura.ardoncompany@gmail.com",
          app_metadata: { role: "owner" }
        }
      }
    });

    const { POST } = await import("@/app/api/admin/mfa/skip/route");

    // 1st skip succeeds
    rpcMock.mockReturnValueOnce({
      single: async () => ({
        data: { previous_count: 0, new_count: 1 },
        error: null
      })
    });

    const firstRes = await POST(
      new NextRequest("https://aura-ardon.vercel.app/api/admin/mfa/skip", {
        method: "POST"
      })
    );
    expect(firstRes.status).toBe(200);
    const firstJson = await firstRes.json();
    expect(firstJson).toMatchObject({
      ok: true,
      skipCount: 1,
      maxSkips: 3,
      skipsRemaining: 2,
      skippedThisSession: true
    });
    expect(firstRes.cookies.get("aa_mfa_skip_session")?.value).toBe("1");
    expect(recordAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "owner_mfa.skipped",
        entity: "admin_user",
        entityId: "owner-1",
        before: { mfa_skip_count: 0 },
        after: { mfa_skip_count: 1, skips_remaining: 2 }
      })
    );

    // 4th attempt after 3 skips is blocked with HTTP 403
    rpcMock.mockReturnValueOnce({
      single: async () => ({
        data: null,
        error: { message: "MFA_SKIP_LIMIT_REACHED" }
      })
    });

    const fourthRes = await POST(
      new NextRequest("https://aura-ardon.vercel.app/api/admin/mfa/skip", {
        method: "POST"
      })
    );
    expect(fourthRes.status).toBe(403);
    const fourthJson = await fourthRes.json();
    expect(fourthJson).toMatchObject({
      code: "MFA_SKIP_LIMIT_REACHED",
      skipCount: 3,
      maxSkips: 3,
      skipsRemaining: 0
    });
    expect(fourthRes.cookies.get("aa_mfa_skip_session")).toBeUndefined();
  });

  it("blocks staff users from POST /api/admin/mfa/skip with HTTP 403", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "staff-1",
          email: "staff@auroardon.co.ke",
          app_metadata: { role: "staff" }
        }
      }
    });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { role: "staff", active: true, mfa_skip_count: 0 },
            error: null
          })
        })
      })
    });

    const { POST } = await import("@/app/api/admin/mfa/skip/route");
    const res = await POST(
      new NextRequest("https://aura-ardon.vercel.app/api/admin/mfa/skip", {
        method: "POST"
      })
    );
    expect(res.status).toBe(403);
  });

  it("reports unenrolled owner banner state in GET /api/admin/mfa/status even when OWNER_MFA_REQUIRED=false", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "owner-1",
          email: "aura.ardoncompany@gmail.com",
          app_metadata: { role: "owner" }
        }
      }
    });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { role: "owner", active: true, mfa_skip_count: 2 },
            error: null
          })
        })
      })
    });

    const { GET } = await import("@/app/api/admin/mfa/status/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      authenticated: true,
      role: "owner",
      hasVerifiedFactor: false,
      mfaStatus: "enroll",
      skipCount: 2,
      skipsRemaining: 1,
      shouldShowBanner: true,
      isBlocking: true,
      isHardRequired: false
    });
  });

  it("enforces MFA_REQUIRED in assertAdminRequest once an unenrolled owner exhausts all 3 skips", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "owner-1",
          email: "aura.ardoncompany@gmail.com",
          app_metadata: { role: "owner" }
        }
      }
    });

    // Skip count = 1 -> allowed
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { role: "owner", active: true, mfa_skip_count: 1 },
            error: null
          })
        })
      })
    });

    const { assertAdminRequest } = await import("@/lib/auth");
    const allowedUser = await assertAdminRequest();
    expect(allowedUser.id).toBe("owner-1");

    // Skip count = 3 without active skipped session -> blocked with MFA_REQUIRED
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { role: "owner", active: true, mfa_skip_count: 3 },
            error: null
          })
        })
      })
    });

    await expect(assertAdminRequest()).rejects.toThrow("MFA_REQUIRED");
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

