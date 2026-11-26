import type { CookieOptions } from "@supabase/ssr";

function parseConfiguredHostname() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!configuredSiteUrl) {
    return null;
  }

  try {
    return new URL(configuredSiteUrl).hostname;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

export function normalizeSupabaseCookieOptions(
  options: CookieOptions,
  requestUrl?: string,
  forwardedProto?: string | null
): CookieOptions {
  const configuredHostname = parseConfiguredHostname();
  const parsedRequest = requestUrl ? new URL(requestUrl) : null;
  const requestHostname = parsedRequest?.hostname ?? null;
  const requestProtocol = parsedRequest?.protocol ?? null;
  const activeHostname = requestHostname ?? configuredHostname;
  const normalizedForwardedProto = forwardedProto
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const isLocal = Boolean(activeHostname && isLocalHostname(activeHostname));
  const isSecureRequest =
    normalizedForwardedProto === "https" ||
    requestProtocol === "https:" ||
    (!isLocal && process.env.NODE_ENV === "production");

  const normalizedOptions: CookieOptions = {
    ...options,
    path: "/",
    secure: isSecureRequest
  };

  if (!activeHostname || isLocal) {
    delete normalizedOptions.domain;
    return normalizedOptions;
  }

  if (normalizedOptions.domain) {
    const normalizedDomain = normalizedOptions.domain.replace(/^\./, "");

    if (
      normalizedDomain !== activeHostname &&
      !activeHostname.endsWith(`.${normalizedDomain}`)
    ) {
      delete normalizedOptions.domain;
    }
  }

  return normalizedOptions;
}
