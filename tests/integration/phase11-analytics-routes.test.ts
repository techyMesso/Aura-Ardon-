import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildEmptyAnalyticsDashboardReport } from "@/lib/analytics";

const assertAdminRequest = vi.fn();
const getAnalyticsDashboardDataMock = vi.fn();
const checkRateLimitMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/auth", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    assertAdminRequest
  };
});
vi.mock("@/lib/data", () => ({
  getAnalyticsDashboardData: (...args: unknown[]) =>
    getAnalyticsDashboardDataMock(...args)
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args)
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => fromMock(table)
  })
}));

describe("Phase 11 analytics, privacy-friendly events, and event retention cron routes", () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalAdminEmail = process.env.ADMIN_EMAIL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = "aura.ardoncompany@gmail.com";
    checkRateLimitMock.mockResolvedValue({
      ok: true,
      limit: 60,
      remaining: 59,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0
    });
  });

  afterEach(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;

    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
  });

  it("ignores bots, strips query params, rate-limits, and inserts zero-PII events via POST /api/events", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });

    const { POST } = await import("@/app/api/events/route");

    // 1. Bot user agent ignored cleanly without DB insert
    const botRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)"
        },
        body: JSON.stringify({
          name: "product_view",
          sessionId: "anon-session-12345",
          path: "/p/watch"
        })
      })
    );
    expect(botRes.status).toBe(202);
    expect(insertMock).not.toHaveBeenCalled();

    // 2. Real shopper event strips query string and stores only allowed columns
    const okRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1"
        },
        body: JSON.stringify({
          name: "product_view",
          productId: "33333333-3333-4333-8333-333333333333",
          sessionId: "anon-session-12345",
          path: "/p/nairobi-watch?utm_source=ig&t=secret"
        })
      })
    );
    expect(okRes.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith({
      name: "product_view",
      product_id: "33333333-3333-4333-8333-333333333333",
      session_id: "anon-session-12345",
      path: "/p/nairobi-watch"
    });

    // 3. Rate-limited session gets 429
    checkRateLimitMock.mockResolvedValueOnce({
      ok: false,
      limit: 60,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      retryAfterSeconds: 30
    });
    const limitedRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0 Safari/604.1"
        },
        body: JSON.stringify({
          name: "add_to_bag",
          sessionId: "anon-session-12345",
          path: "/p/nairobi-watch"
        })
      })
    );
    expect(limitedRes.status).toBe(429);
    expect(limitedRes.headers.get("Retry-After")).toBe("30");
  });

  it("enforces owner vs staff metrics visibility on GET /api/admin/analytics", async () => {
    const { GET } = await import("@/app/api/admin/analytics/route");

    // Owner request -> includeOwnerMetrics = true
    assertAdminRequest.mockResolvedValueOnce({
      id: "owner-1",
      email: "aura.ardoncompany@gmail.com",
      app_metadata: {}
    });
    getAnalyticsDashboardDataMock.mockResolvedValueOnce(
      buildEmptyAnalyticsDashboardReport("2026-05-01", "2026-05-07", true)
    );

    const ownerRes = await GET(
      new Request(
        "https://aura-ardon.vercel.app/api/admin/analytics?preset=custom&from=2026-05-01&to=2026-05-07"
      )
    );
    expect(ownerRes.status).toBe(200);
    expect(getAnalyticsDashboardDataMock).toHaveBeenCalledWith({
      from: "2026-05-01",
      to: "2026-05-07",
      includeOwnerMetrics: true
    });

    // Staff request -> includeOwnerMetrics = false
    assertAdminRequest.mockResolvedValueOnce({
      id: "staff-1",
      email: "staff@example.com",
      app_metadata: { role: "staff" }
    });
    getAnalyticsDashboardDataMock.mockResolvedValueOnce(
      buildEmptyAnalyticsDashboardReport("2026-05-01", "2026-05-07", false)
    );

    const staffRes = await GET(
      new Request(
        "https://aura-ardon.vercel.app/api/admin/analytics?preset=custom&from=2026-05-01&to=2026-05-07"
      )
    );
    expect(staffRes.status).toBe(200);
    expect(getAnalyticsDashboardDataMock).toHaveBeenCalledWith({
      from: "2026-05-01",
      to: "2026-05-07",
      includeOwnerMetrics: false
    });
  });

  it("protects /api/cron/prune-events with CRON_SECRET and deletes rows older than 12 months", async () => {
    process.env.CRON_SECRET = "prune-events-secret-1234";
    const { GET } = await import("@/app/api/cron/prune-events/route");

    const unauthRes = await GET(
      new Request("https://aura-ardon.vercel.app/api/cron/prune-events", {
        headers: { authorization: "Bearer bad" }
      })
    );
    expect(unauthRes.status).toBe(401);

    const ltMock = vi.fn().mockResolvedValue({ count: 42, error: null });
    fromMock.mockReturnValue({
      delete: () => ({ lt: ltMock })
    });

    const okRes = await GET(
      new Request("https://aura-ardon.vercel.app/api/cron/prune-events", {
        headers: { authorization: "Bearer prune-events-secret-1234" }
      })
    );
    const json = await okRes.json();
    expect(okRes.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.deletedCount).toBe(42);
    expect(ltMock).toHaveBeenCalledWith("created_at", expect.any(String));
  });
});

