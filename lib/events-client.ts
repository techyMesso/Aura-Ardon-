"use client";

import { track as trackVercelEvent } from "@vercel/analytics";

import {
  hasInternalCookieInBrowser,
  isAdminPath
} from "@/lib/internal-traffic";
import type { StorefrontEventName } from "@/lib/types";

const ANON_SESSION_STORAGE_KEY = "auro-ardon-anon-session";
const BEGIN_CHECKOUT_DEDUPE_KEY = "auro-ardon-begin-checkout-ts";
const ORDER_SENT_DEDUPE_KEY = "auro-ardon-order-sent-numbers";
export const BEGIN_CHECKOUT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

function getOrCreateAnonymousSessionId(): string {
  if (typeof window === "undefined") return "ssr-session";
  try {
    const existing = window.localStorage.getItem(ANON_SESSION_STORAGE_KEY);
    if (existing && existing.length >= 8 && existing.length <= 80) {
      return existing;
    }
    const created =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(ANON_SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function shouldDedupeBeginCheckout(nowMs = Date.now()): boolean {
  try {
    const raw = window.sessionStorage.getItem(BEGIN_CHECKOUT_DEDUPE_KEY);
    const lastTs = raw ? Number(raw) : 0;
    if (Number.isFinite(lastTs) && lastTs > 0 && nowMs - lastTs < BEGIN_CHECKOUT_DEDUPE_WINDOW_MS) {
      return true;
    }
    window.sessionStorage.setItem(BEGIN_CHECKOUT_DEDUPE_KEY, String(nowMs));
    return false;
  } catch {
    return false;
  }
}

function shouldDedupeOrderSent(orderNumber: string): boolean {
  const normalized = orderNumber.trim().toUpperCase();
  if (!normalized) return true;
  try {
    const raw = window.sessionStorage.getItem(ORDER_SENT_DEDUPE_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (list.includes(normalized)) {
      return true;
    }
    const next = [normalized, ...list].slice(0, 25);
    window.sessionStorage.setItem(ORDER_SENT_DEDUPE_KEY, JSON.stringify(next));
    return false;
  } catch {
    return false;
  }
}

/**
 * Privacy-friendly storefront event tracker.
 * - Never tracks on `/admin` routes.
 * - `begin_checkout` is deduped to once per session per 30 minutes (client + server).
 * - `whatsapp_order_sent` requires a saved `orderNumber` and fires strictly once per order.
 * - Drops Vercel Analytics custom mirroring when `aa_internal=1` cookie is present.
 */
export function trackStorefrontEvent(
  name: StorefrontEventName,
  options?: { productId?: string | null; path?: string; orderNumber?: string | null }
): void {
  if (typeof window === "undefined") return;

  const currentPath = window.location.pathname || "/";
  const path = (options?.path || currentPath).slice(0, 300);

  // Never track storefront events on /admin routes
  if (isAdminPath(currentPath) || isAdminPath(path)) {
    return;
  }

  const orderNumber = options?.orderNumber?.trim().toUpperCase() || null;

  // Fire whatsapp_order_sent strictly after an order is saved with an order number, once per order
  if (name === "whatsapp_order_sent") {
    if (!orderNumber || shouldDedupeOrderSent(orderNumber)) {
      return;
    }
  }

  // Dedupe begin_checkout to once per session per 30 minutes
  if (name === "begin_checkout" && shouldDedupeBeginCheckout()) {
    return;
  }

  const productId = options?.productId ?? null;
  const sessionId = getOrCreateAnonymousSessionId();

  // Mirror custom event to @vercel/analytics only for non-internal browsers
  if (!hasInternalCookieInBrowser()) {
    try {
      const vercelProps: Record<string, string> = { path };
      if (productId) {
        vercelProps.product_id = productId;
      }
      if (orderNumber) {
        vercelProps.order_number = orderNumber;
      }
      trackVercelEvent(name, vercelProps);
    } catch {
      // Never block UX if Vercel Analytics is unavailable or blocked
    }
  }

  const payload = JSON.stringify({
    name,
    productId,
    sessionId,
    path,
    ...(orderNumber ? { orderNumber } : {})
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/events", blob)) {
        return;
      }
    }
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true
    }).catch(() => {});
  } catch {
    // Telemetry is strictly best-effort
  }
}
