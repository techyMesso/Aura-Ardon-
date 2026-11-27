import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const SENSITIVE_KEY_PATTERN =
  /phone|tel|mobile|address|landmark|location|street|town|county|customer_name|full_?name|gift_?note|email|cookie|authorization|secret|token|password|mpesa|ip_?address/i;

// Matches Kenyan mobile formats (+2547..., 2547..., 07..., +2541..., 2541..., 01...) with optional spaces/dashes
const KENYAN_PHONE_PATTERN =
  /(?:\+?254[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}|\b0[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b)/g;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function scrubPiiString(value: string): string {
  return value
    .replace(KENYAN_PHONE_PATTERN, "[REDACTED_PHONE]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]");
}

export function scrubPiiDeep(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return scrubPiiString(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => scrubPiiDeep(item, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = scrubPiiDeep(nested, depth + 1);
      }
    }
    return output;
  }

  return value;
}

/**
 * Sentry beforeSend hook: strips all personal data (phone numbers, addresses,
 * customer names, emails, IP addresses, cookies, auth headers) before any event leaves the app.
 */
export function scrubSentryEvent(
  event: ErrorEvent,
  _hint?: EventHint
): ErrorEvent | null {
  void _hint;
  const clone: ErrorEvent = { ...event };

  if (typeof clone.message === "string") {
    clone.message = scrubPiiString(clone.message);
  }

  if (clone.user) {
    const safeUser: Record<string, unknown> = {};
    if (clone.user.id) safeUser.id = clone.user.id;
    clone.user = safeUser;
  }

  if (clone.request) {
    const cleanedHeaders: Record<string, string> = {};
    if (clone.request.headers && typeof clone.request.headers === "object") {
      for (const [k, v] of Object.entries(clone.request.headers)) {
        if (/cookie|authorization|x-forwarded-for|x-real-ip/i.test(k)) {
          cleanedHeaders[k] = "[REDACTED]";
        } else if (typeof v === "string") {
          cleanedHeaders[k] = scrubPiiString(v);
        }
      }
    }

    clone.request = {
      ...clone.request,
      headers: cleanedHeaders,
      cookies: undefined,
      data: clone.request.data ? scrubPiiDeep(clone.request.data) : undefined,
      url:
        typeof clone.request.url === "string"
          ? scrubPiiString(clone.request.url.split("?")[0] ?? clone.request.url)
          : clone.request.url,
      query_string: undefined
    };
  }

  if (clone.extra) {
    clone.extra = scrubPiiDeep(clone.extra) as Record<string, unknown>;
  }

  if (clone.contexts) {
    clone.contexts = scrubPiiDeep(clone.contexts) as ErrorEvent["contexts"];
  }

  if (clone.tags) {
    clone.tags = scrubPiiDeep(clone.tags) as ErrorEvent["tags"];
  }

  if (Array.isArray(clone.breadcrumbs)) {
    clone.breadcrumbs = clone.breadcrumbs.map(crumb => ({
      ...crumb,
      message:
        typeof crumb.message === "string"
          ? scrubPiiString(crumb.message)
          : crumb.message,
      data: crumb.data
        ? (scrubPiiDeep(crumb.data) as Record<string, unknown>)
        : undefined
    }));
  }

  if (clone.exception?.values) {
    clone.exception = {
      ...clone.exception,
      values: clone.exception.values.map(val => ({
        ...val,
        value: typeof val.value === "string" ? scrubPiiString(val.value) : val.value
      }))
    };
  }

  return clone;
}

