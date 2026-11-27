export const INTERNAL_TRAFFIC_COOKIE = "aa_internal";
export const INTERNAL_TRAFFIC_COOKIE_VALUE = "1";
export const INTERNAL_TRAFFIC_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Cookie options for marking internal admin/staff browsers.
 * Intentionally readable by client JS (`httpOnly: false`) so Vercel Analytics
 * and Speed Insights `beforeSend` hooks can drop internal traffic reliably even when logged out.
 */
export function buildInternalTrafficCookieOptions(isSecure: boolean) {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: isSecure,
    path: "/",
    maxAge: INTERNAL_TRAFFIC_COOKIE_MAX_AGE
  };
}

export function hasInternalCookieInHeader(
  cookieHeader: string | null | undefined
): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .some(part => {
      const [rawName, ...rest] = part.split("=");
      if (!rawName) return false;
      return (
        rawName.trim() === INTERNAL_TRAFFIC_COOKIE &&
        rest.join("=").trim() === INTERNAL_TRAFFIC_COOKIE_VALUE
      );
    });
}

export function hasInternalCookieInBrowser(): boolean {
  if (typeof document === "undefined") return false;
  return hasInternalCookieInHeader(document.cookie);
}

/**
 * Checks whether a relative path or absolute URL targets an `/admin` route.
 */
export function isAdminPath(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false;
  let pathname = pathOrUrl.trim();
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return false;
    }
  }
  const clean = pathname.split(/[?#]/)[0] || "/";
  return clean === "/admin" || clean.startsWith("/admin/");
}

export function shouldDropTelemetryEvent(
  url: string | null | undefined,
  cookieString: string | null | undefined
): boolean {
  return isAdminPath(url) || hasInternalCookieInHeader(cookieString);
}

