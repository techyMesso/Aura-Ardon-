"use client";

import { track as trackVercelEvent } from "@vercel/analytics";

import type { StorefrontEventName } from "@/lib/types";

const ANON_SESSION_STORAGE_KEY = "auro-ardon-anon-session";

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

/**
 * Privacy-friendly storefront event tracker.
 * Stores ONLY event name, optional productId, random anonymous localStorage session ID, and path.
 * Never sends customer names, phone numbers, emails, or IP addresses.
 * Also mirrors the same custom event to Vercel Web Analytics.
 */
export function trackStorefrontEvent(
  name: StorefrontEventName,
  options?: { productId?: string | null; path?: string }
): void {
  if (typeof window === "undefined") return;

  const path = (options?.path || window.location.pathname || "/").slice(0, 300);
  const productId = options?.productId ?? null;
  const sessionId = getOrCreateAnonymousSessionId();

  // Mirror custom event to @vercel/analytics (non-blocking)
  try {
    const vercelProps: Record<string, string> = { path };
    if (productId) {
      vercelProps.product_id = productId;
    }
    trackVercelEvent(name, vercelProps);
  } catch {
    // Never block UX if Vercel Analytics is unavailable or blocked
  }

  // Record in privacy-friendly first-party events table via rate-limited route
  const payload = JSON.stringify({
    name,
    productId,
    sessionId,
    path
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

