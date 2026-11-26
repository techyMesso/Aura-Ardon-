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

let cachedRedisKey: string | null = null;
let cachedRedisClient: Redis | null = null;
const ratelimitCache = new Map<string, Ratelimit>();

export function resetRateLimitBuckets() {
  cachedRedisKey = null;
  cachedRedisClient = null;
  ratelimitCache.clear();
}

export function getClientIp(headers: Headers) {
  const trustedSingleIpHeaders = [
    "x-vercel-forwarded-for",
    "cf-connecting-ip",
    "x-real-ip"
  ];

  for (const headerName of trustedSingleIpHeaders) {
    const value = headers.get(headerName)?.trim();
    if (value) {
      const [first] = value.split(",");
      if (first?.trim()) return first.trim();
    }
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [firstIp] = forwardedFor.split(",");
    if (firstIp?.trim()) return firstIp.trim();
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

function getOrCreateRatelimit(
  redisEnv: { url: string; token: string },
  limit: number,
  windowMs: number
) {
  const envKey = `${redisEnv.url}|${redisEnv.token}`;
  if (!cachedRedisClient || cachedRedisKey !== envKey) {
    cachedRedisClient = new Redis({
      url: redisEnv.url,
      token: redisEnv.token
    });
    cachedRedisKey = envKey;
    ratelimitCache.clear();
  }

  const limiterKey = `${limit}:${windowMs}`;
  let ratelimit = ratelimitCache.get(limiterKey);
  if (!ratelimit) {
    ratelimit = new Ratelimit({
      redis: cachedRedisClient,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: "auro-ardon:ratelimit",
      ephemeralCache: false,
      analytics: false
    });
    ratelimitCache.set(limiterKey, ratelimit);
  }
  return ratelimit;
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
    const ratelimit = getOrCreateRatelimit(redisEnv, limit, windowMs);
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
