import { createHmac, timingSafeEqual } from "node:crypto";

import { getOrderStatusTokenSecret } from "@/lib/env";

function signPayload(payload: string) {
  return createHmac("sha256", getOrderStatusTokenSecret())
    .update(payload)
    .digest("base64url");
}

function safeCompare(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createOrderStatusToken(orderId: string) {
  return `${orderId}.${signPayload(orderId)}`;
}

export function verifyOrderStatusToken(token: string) {
  const separatorIndex = token.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const orderId = token.slice(0, separatorIndex);
  const providedSignature = token.slice(separatorIndex + 1);
  const expectedSignature = signPayload(orderId);

  if (!safeCompare(providedSignature, expectedSignature)) {
    return null;
  }

  return orderId;
}

/**
 * Signed token specifically for public /order/[orderNumber]?t=... access.
 * Bound to the uppercase orderNumber so tokens cannot be reused across orders.
 */
export function createOrderNumberToken(orderNumber: string) {
  const normalized = orderNumber.trim().toUpperCase();
  return signPayload(`order-number:${normalized}`);
}

export function verifyOrderNumberToken(
  token: string | null | undefined,
  expectedOrderNumber: string
): boolean {
  if (!token || !expectedOrderNumber) return false;
  const normalized = expectedOrderNumber.trim().toUpperCase();
  const expected = signPayload(`order-number:${normalized}`);
  return safeCompare(token.trim(), expected);
}
