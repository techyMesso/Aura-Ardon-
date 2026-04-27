type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitBucket>();

export function resetRateLimitBuckets() {
  buckets.clear();
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

export function checkRateLimit({
  key,
  limit,
  windowMs
}: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const currentBucket = buckets.get(key);

  if (!currentBucket || currentBucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });

    return {
      ok: true,
      limit,
      remaining: Math.max(limit - 1, 0),
      resetAt,
      retryAfterSeconds: Math.ceil(windowMs / 1000)
    };
  }

  if (currentBucket.count >= limit) {
    return {
      ok: false,
      limit,
      remaining: 0,
      resetAt: currentBucket.resetAt,
      retryAfterSeconds: Math.max(Math.ceil((currentBucket.resetAt - now) / 1000), 1)
    };
  }

  currentBucket.count += 1;

  return {
    ok: true,
    limit,
    remaining: Math.max(limit - currentBucket.count, 0),
    resetAt: currentBucket.resetAt,
    retryAfterSeconds: Math.max(Math.ceil((currentBucket.resetAt - now) / 1000), 1)
  };
}
