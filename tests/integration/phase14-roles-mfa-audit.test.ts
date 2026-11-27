import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUserMock = vi.fn();
const signOutMock = vi.fn();
const getAalMock = vi.fn();
const listFactorsMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const cookiesGetMock = vi.fn();
const checkRateLimitMock = vi.fn();
const listAuditLogsMock = vi.fn();
const fromMock = vi.fn();
const createAuthUserMock = vi.fn();
const updateAuthUserMock = vi.fn();

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
  })
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
      signOut: () => signOutMock(),
      mfa: {
        getAuthenticatorAssuranceLevel: () => getAalMock(),
        listFactors: () => listFactorsMock()
      }
    }
  })
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => fromMock(table),
    auth: {
      admin: {
        createUser: (...args: unknown[]) => createAuthUserMock(...args),
        updateUserById: (...args: unknown[]) => updateAuthUserMock(...args)
      }
    }
  })
}));

vi.mock("@/lib/rate-limit", () => ({
  getClientIp: () => "196.201.214.50",
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args)
}));

vi.mock("@/lib/audit", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...actual,
    listAuditLogs: (...args: unknown[]) => listAuditLogsMock(...args)
  };
});

describe("Phase 14 owner vs staff RBAC, owner MFA, inactivity timeout, and audit log routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = "aura.ardoncompany@gmail.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://scukquqkdivnodefqggf.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.OWNER_MFA_REQUIRED = "true";

    cookiesGetMock.mockReturnValue(undefined);
    signOutMock.mockResolvedValue({ error: null });
    getAalMock.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null
    });
    listFactorsMock.mockResolvedValue({
      data: { totp: [{ id: "11111111-1111-4111-8111-111111111111", status: "verified" }] },
      error: null
    });
    checkRateLimitMock.mockResolvedValue({
      ok: true,
      limit: 5,
      remaining: 4,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0
    });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        order: () => ({
          order: async () => ({ data: [], error: null })
        })
      }),
      insert: async () => ({ error: null })
    });
  });

  it("blocks staff users with HTTP 403 on settings, discounts, audit log, delivery margin, daily summary, and user management", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "staff-user-1",
          email: "staff@auroardon.co.ke",
          app_metadata: { role: "staff" }
        }
      }
    });

    const { GET: getSettings, PATCH: patchSettings } = await import(
      "@/app/api/admin/settings/route"
    );
    const { GET: getDiscounts, POST: postDiscount } = await import(
      "@/app/api/admin/discounts/route"
    );
    const { GET: getAudit } = await import("@/app/api/admin/audit/route");
    const { GET: getUsers, POST: postUser } = await import(
      "@/app/api/admin/users/route"
    );
    const { GET: getDeliveryMargin } = await import(
      "@/app/api/admin/reports/delivery-margin/route"
    );
    const { GET: getDailySummary } = await import(
      "@/app/api/admin/notifications/daily-summary/route"
    );

    expect((await getSettings()).status).toBe(403);
    expect(
      (
        await patchSettings(
          new Request("https://aura-ardon.vercel.app/api/admin/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ site_name: "Hacked" })
          })
        )
      ).status
    ).toBe(403);
    expect((await getDiscounts()).status).toBe(403);
    expect(
      (
        await postDiscount(
          new Request("https://aura-ardon.vercel.app/api/admin/discounts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: "STAFF10", type: "percent", value: 10 })
          })
        )
      ).status
    ).toBe(403);
    expect(
      (
        await getAudit(
          new Request("https://aura-ardon.vercel.app/api/admin/audit")
        )
      ).status
    ).toBe(403);
    expect((await getUsers()).status).toBe(403);
    expect(
      (
        await postUser(
          new Request("https://aura-ardon.vercel.app/api/admin/users", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              email: "other@auroardon.co.ke",
              fullName: "Other",
              role: "owner",
              password: "LongPassword123!"
            })
          })
        )
      ).status
    ).toBe(403);
    expect(
      (
        await getDeliveryMargin(
          new Request("https://aura-ardon.vercel.app/api/admin/reports/delivery-margin")
        )
      ).status
    ).toBe(403);
    expect(
      (
        await getDailySummary(
          new Request("https://aura-ardon.vercel.app/api/admin/notifications/daily-summary")
        )
      ).status
    ).toBe(403);
  });

  it("blocks owner at AAL1 with HTTP 403 (MFA_REQUIRED) and allows owner at AAL2 to read audit log & create staff with audit trail", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "owner-user-1",
          email: "aura.ardoncompany@gmail.com",
          app_metadata: { role: "owner" }
        }
      }
    });

    // 1. Owner at AAL1 (MFA not yet verified) -> 403 MFA_REQUIRED
    getAalMock.mockResolvedValueOnce({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null
    });
    const { GET: getAudit } = await import("@/app/api/admin/audit/route");
    const aal1Res = await getAudit(
      new Request("https://aura-ardon.vercel.app/api/admin/audit")
    );
    expect(aal1Res.status).toBe(403);
    const aal1Json = await aal1Res.json();
    expect(aal1Json.error).toBe("MFA_REQUIRED");

    // 2. Owner at AAL2 -> 200 on audit log
    getAalMock.mockResolvedValueOnce({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null
    });
    listAuditLogsMock.mockResolvedValueOnce({
      entries: [
        {
          id: "audit-1",
          actor_id: "owner-user-1",
          actor_email: "aura.ardoncompany@gmail.com",
          actor_role: "owner",
          action: "settings.updated",
          entity: "store_settings",
          entity_id: "singleton",
          before_data: null,
          after_data: { site_name: "Auro Ardon" },
          metadata: {},
          created_at: "2026-05-15T12:00:00Z"
        }
      ],
      total: 1,
      limit: 50,
      offset: 0
    });
    const aal2Res = await getAudit(
      new Request("https://aura-ardon.vercel.app/api/admin/audit?entity=store_settings")
    );
    expect(aal2Res.status).toBe(200);
    const auditPayload = await aal2Res.json();
    expect(auditPayload.entries).toHaveLength(1);
    expect(listAuditLogsMock).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "store_settings" })
    );
  });

  it("enforces rate limiting and TOTP MFA prompt on POST /api/admin/login for owner accounts", async () => {
    const { POST } = await import("@/app/api/admin/login/route");

    // 1. Rate-limited -> 429
    checkRateLimitMock.mockResolvedValueOnce({
      ok: false,
      limit: 5,
      remaining: 0,
      resetAt: Date.now() + 120_000,
      retryAfterSeconds: 120
    });
    const limitedRes = await POST(
      new NextRequest("https://aura-ardon.vercel.app/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "Password123!" })
      })
    );
    expect(limitedRes.status).toBe(429);

    // 2. Owner login at AAL1 with verified factor -> mfaRequired: true, mfaStatus: "verify"
    signInWithPasswordMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "owner-user-1",
          email: "aura.ardoncompany@gmail.com",
          app_metadata: { role: "owner" }
        }
      },
      error: null
    });
    getAalMock.mockResolvedValueOnce({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null
    });
    listFactorsMock.mockResolvedValueOnce({
      data: {
        totp: [{ id: "11111111-1111-4111-8111-111111111111", status: "verified" }]
      },
      error: null
    });

    const ownerLoginRes = await POST(
      new NextRequest("https://aura-ardon.vercel.app/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "aura.ardoncompany@gmail.com",
          password: "Password123!"
        })
      })
    );
    expect(ownerLoginRes.status).toBe(200);
    const ownerJson = await ownerLoginRes.json();
    expect(ownerJson).toMatchObject({
      ok: true,
      role: "owner",
      mfaRequired: true,
      mfaStatus: "verify",
      factorId: "11111111-1111-4111-8111-111111111111"
    });
  });

  it("expires inactive sessions with HTTP 401 SESSION_EXPIRED when activity cookie is stale", async () => {
    const { createAdminActivityToken } = await import("@/lib/session-timeout");
    const staleToken = await createAdminActivityToken(
      "staff-user-1",
      Date.now() - 45 * 60 * 1000 // 45 minutes ago (> 30m timeout)
    );

    getUserMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "staff-user-1",
          email: "staff@auroardon.co.ke",
          app_metadata: { role: "staff" }
        }
      }
    });
    cookiesGetMock.mockReturnValueOnce({ value: staleToken });

    const { POST: pingSession } = await import(
      "@/app/api/admin/session/ping/route"
    );
    const res = await pingSession(
      new NextRequest("https://aura-ardon.vercel.app/api/admin/session/ping", {
        method: "POST"
      })
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("SESSION_EXPIRED");
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});

