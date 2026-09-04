import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { z } from "zod";

import { getAdminEmail, getSupabaseEnv } from "@/lib/env";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";
import { normalizeSupabaseCookieOptions } from "@/lib/supabase/cookies";

export const runtime = "nodejs";
const SUPABASE_AUTH_TIMEOUT_MS = 8000;
const INVALID_CREDENTIALS = "Invalid email or password.";

const loginSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters.")
});

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateLimit = checkRateLimit({
    key: `admin-login:${ip}`,
    limit: 5,
    windowMs: 10 * 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": `${rateLimit.retryAfterSeconds}`
        }
      }
    );
  }

  try {
    const payload = loginSchema.parse(await request.json());
    const adminEmail = getAdminEmail();
    const { url, anonKey } = getSupabaseEnv();
    const successResponse = NextResponse.json({ ok: true });

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const normalizedOptions = normalizeSupabaseCookieOptions(options, request.url);

            request.cookies.set({ name, value, ...normalizedOptions });
            successResponse.cookies.set(name, value, normalizedOptions);
          });
        }
      }
    });

    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({
        email: adminEmail,
        password: payload.password
      }),
      SUPABASE_AUTH_TIMEOUT_MS,
      "Admin sign-in timed out while contacting Supabase."
    );

    if (error || !data.user) {
      return jsonError(INVALID_CREDENTIALS, 401);
    }

    if (data.user.email?.toLowerCase() !== adminEmail) {
      await supabase.auth.signOut();
      return jsonError(INVALID_CREDENTIALS, 401);
    }

    return successResponse;
  } catch (caughtError) {
    if (caughtError instanceof z.ZodError) {
      return jsonError(caughtError.issues[0]?.message ?? "Invalid login request.", 400);
    }

    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to sign in.";

    if (message.includes("timed out")) {
      return jsonError(message, 504);
    }

    return jsonError(INVALID_CREDENTIALS, 401);
  }
}
