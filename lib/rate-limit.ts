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

export function checkRateLimit({
  limit,
  windowMs
}: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  return {
    ok: true,
    limit,
    remaining: Math.max(limit - 1, 0),
    resetAt: now + windowMs,
    retryAfterSeconds: Math.max(Math.ceil(windowMs / 1000), 1)
  };
}
