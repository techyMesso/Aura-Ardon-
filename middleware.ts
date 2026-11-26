import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { normalizeSupabaseCookieOptions } from "@/lib/supabase/cookies";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  // Redirect legacy /admin/login to canonical /login outside AdminLayout
  if (request.nextUrl.pathname === "/admin/login") {
    const loginUrl = new URL("/login", request.url);
    const redirectedFrom = request.nextUrl.searchParams.get("redirectedFrom");
    if (redirectedFrom) {
      loginUrl.searchParams.set("redirectedFrom", redirectedFrom);
    }
    return NextResponse.redirect(loginUrl);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
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
    redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"]
};
