import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limitMock = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({}))
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(
    vi.fn().mockImplementation(() => ({
      limit: limitMock
    })),
    {
      slidingWindow: vi.fn().mockReturnValue("sliding-window")
    }
  )
}));

describe("checkRateLimit", () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    if (originalUrl) {
      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    } else {
      delete process.env.UPSTASH_REDIS_REST_URL;
    }

    if (originalToken) {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    } else {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });

  it("gracefully degrades with a console warning when Redis env vars are missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const result = await checkRateLimit({
      key: "checkout:ip:127.0.0.1",
      limit: 5,
      windowMs: 600_000
    });

    expect(result.ok).toBe(true);
    expect(result.limit).toBe(5);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing")
    );
    expect(limitMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("enforces rate limits via Upstash when Redis env vars are configured", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

    limitMock.mockResolvedValueOnce({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 30_000
    });

    const { checkRateLimit } = await import("@/lib/rate-limit");
    const result = await checkRateLimit({
      key: "checkout:phone:+254712345678",
      limit: 5,
      windowMs: 600_000
    });

    expect(limitMock).toHaveBeenCalledWith("checkout:phone:+254712345678");
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
