import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { getUpstashRedisEnv } from "@/lib/env";

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export function resetRateLimitBuckets() {
  // Stateless no-op; kept for test suite compatibility.
}

export function getClientIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [firstIp] = forwardedFor.split(",");
    return firstIp.trim();
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

function createAllowedResult(limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  return {
    ok: true,
    limit,
    remaining: Math.max(limit - 1, 0),
    resetAt: now + windowMs,
    retryAfterSeconds: 0
  };
}

export async function checkRateLimit({
  key,
  limit,
  windowMs
}: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const redisEnv = getUpstashRedisEnv();

  if (!redisEnv) {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing; skipping rate limiting."
    );
    return createAllowedResult(limit, windowMs);
  }

  try {
    const redis = new Redis({
      url: redisEnv.url,
      token: redisEnv.token
    });
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: "auro-ardon:ratelimit",
      ephemeralCache: false,
      analytics: false
    });

    const result = await ratelimit.limit(key);
    const now = Date.now();
    const retryAfterSeconds = result.success
      ? 0
      : Math.max(Math.ceil((result.reset - now) / 1000), 1);

    return {
      ok: result.success,
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.reset,
      retryAfterSeconds
    };
  } catch (error) {
    console.warn(
      "[rate-limit] Upstash Redis rate-limit check failed; failing open:",
      error instanceof Error ? error.message : error
    );
    return createAllowedResult(limit, windowMs);
  }
}
