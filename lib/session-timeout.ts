/**
 * Edge- and Node-compatible signed inactivity timeout cookie for admin sessions.
 * Uses Web Crypto HMAC-SHA256 so middleware.ts (Edge) and route handlers (Node) share one implementation.
 */

export const ADMIN_ACTIVITY_COOKIE = "aa_admin_last_active";
export const DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES = 30;

export function getAdminIdleTimeoutMs(): number {
  const raw = Number(process.env.ADMIN_IDLE_TIMEOUT_MINUTES);
  if (Number.isFinite(raw) && raw >= 5 && raw <= 480) {
    return Math.round(raw * 60 * 1000);
  }
  return DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES * 60 * 1000;
}

function resolveSigningSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ORDER_STATUS_TOKEN_SECRET?.trim() ||
    "auro-ardon-dev-session-timeout-fallback"
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function computeHmacHex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );
  return bytesToHex(new Uint8Array(sig));
}

export async function createAdminActivityToken(
  userId: string,
  nowMs = Date.now()
): Promise<string> {
  const ts = String(Math.floor(nowMs));
  const signature = await computeHmacHex(
    `${userId}:${ts}`,
    resolveSigningSecret()
  );
  return `${ts}.${signature}`;
}

export async function verifyAdminActivityToken(params: {
  token: string | undefined | null;
  userId: string;
  nowMs?: number;
  timeoutMs?: number;
}): Promise<{ valid: boolean; expired: boolean; lastActiveMs: number | null }> {
  const {
    token,
    userId,
    nowMs = Date.now(),
    timeoutMs = getAdminIdleTimeoutMs()
  } = params;

  if (!token || !token.includes(".")) {
    return { valid: false, expired: false, lastActiveMs: null };
  }

  const [tsRaw, providedSig] = token.split(".");
  const lastActiveMs = Number(tsRaw);
  if (
    !tsRaw ||
    !providedSig ||
    !Number.isFinite(lastActiveMs) ||
    lastActiveMs <= 0
  ) {
    return { valid: false, expired: false, lastActiveMs: null };
  }

  const expectedSig = await computeHmacHex(
    `${userId}:${tsRaw}`,
    resolveSigningSecret()
  );

  if (!constantTimeEqualHex(providedSig, expectedSig)) {
    return { valid: false, expired: false, lastActiveMs: null };
  }

  if (nowMs - lastActiveMs > timeoutMs) {
    return { valid: false, expired: true, lastActiveMs };
  }

  return { valid: true, expired: false, lastActiveMs };
}

export function buildAdminActivityCookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecure,
    path: "/",
    maxAge: Math.ceil(getAdminIdleTimeoutMs() / 1000) + 300
  };
}

