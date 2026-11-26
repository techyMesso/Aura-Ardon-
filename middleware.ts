import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { normalizeSupabaseCookieOptions } from "@/lib/supabase/cookies";

async function lookupSlugRedirect(
  pathname: string,
  supabaseUrl: string | undefined,
  supabaseAnonKey: string | undefined
): Promise<{ to_path: string; status_code: number } | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const normalized = pathname.replace(/\/+$/, "").toLowerCase();
  if (!normalized) return null;

  try {
    const endpoint = new URL("/rest/v1/redirects", supabaseUrl);
    endpoint.searchParams.set("select", "to_path,status_code");
    endpoint.searchParams.set("from_path", `ilike.${normalized}`);
    endpoint.searchParams.set("active", "eq.true");
    endpoint.searchParams.set("limit", "1");

    const response = await fetch(endpoint.toString(), {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      },
      cache: "no-store"
    });

    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{
      to_path?: string;
      status_code?: number;
    }>;
    const match = rows[0];
    if (!match?.to_path || match.to_path.toLowerCase() === normalized) {
      return null;
    }
    return {
      to_path: match.to_path,
      status_code: match.status_code === 302 || match.status_code === 307 || match.status_code === 308
        ? match.status_code
        : 301
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Storefront slug 301 redirects (/p/:slug and /shop/:category)
  if (pathname.startsWith("/p/") || pathname.startsWith("/shop/")) {
    const match = await lookupSlugRedirect(
      decodeURIComponent(pathname),
      supabaseUrl,
      supabaseAnonKey
    );
    if (match) {
      const targetUrl = new URL(match.to_path, request.url);
      if (request.nextUrl.search) {
        targetUrl.search = request.nextUrl.search;
      }
      return NextResponse.redirect(targetUrl, match.status_code);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  // Redirect legacy /admin/login to canonical /login outside AdminLayout
  if (pathname === "/admin/login") {
    const loginUrl = new URL("/login", request.url);
    const redirectedFrom = request.nextUrl.searchParams.get("redirectedFrom");
    if (redirectedFrom) {
      loginUrl.searchParams.set("redirectedFrom", redirectedFrom);
    }
    return NextResponse.redirect(loginUrl);
  }

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

  if (!supabaseUrl || !supabaseAnonKey || !adminEmail) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options: CookieOptions;
        }>
      ) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const normalizedOptions = normalizeSupabaseCookieOptions(
            options,
            request.url,
            forwardedProto
          );

          request.cookies.set({ name, value, ...normalizedOptions });
        });

        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(
            name,
            value,
            normalizeSupabaseCookieOptions(options, request.url, forwardedProto)
          );
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user || user.email?.toLowerCase() !== adminEmail) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/p/:path*", "/shop/:path*"]
};
