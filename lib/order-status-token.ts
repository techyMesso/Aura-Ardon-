import { createHmac, timingSafeEqual } from "node:crypto";

import { getOrderStatusTokenSecret } from "@/lib/env";

function signOrderId(orderId: string) {
  return createHmac("sha256", getOrderStatusTokenSecret()).update(orderId).digest("base64url");
}

export function createOrderStatusToken(orderId: string) {
  return `${orderId}.${signOrderId(orderId)}`;
}

export function verifyOrderStatusToken(token: string) {
  const separatorIndex = token.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const orderId = token.slice(0, separatorIndex);
  const providedSignature = token.slice(separatorIndex + 1);
  const expectedSignature = signOrderId(orderId);

  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length) {
    return null;
  }

  if (!timingSafeEqual(provided, expected)) {
    return null;
  }

  return orderId;
}
