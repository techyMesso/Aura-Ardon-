import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { normalizeSupabaseCookieOptions } from "@/lib/supabase/cookies";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

  if (!supabaseUrl || !supabaseAnonKey || !adminEmail) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Allow unauthenticated access to admin login page
  if (request.nextUrl.pathname === "/admin/login") {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const normalizedOptions = normalizeSupabaseCookieOptions(options, request.url);

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
            normalizeSupabaseCookieOptions(options, request.url)
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
