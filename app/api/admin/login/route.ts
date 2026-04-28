import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { buildSiteUrl, getAdminEmail, getSupabaseEnv } from "@/lib/env";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
const SUPABASE_AUTH_TIMEOUT_MS = 8000;

const loginSchema = z.object({
  email: z.string().email()
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

    if (payload.email.toLowerCase() !== getAdminEmail()) {
      return NextResponse.json(
        { error: "Use the configured admin email address." },
        { status: 403 }
      );
    }

    const { url, anonKey } = getSupabaseEnv();
    const callbackUrl = buildSiteUrl("/auth/callback", request.nextUrl.origin);
    const supabase = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { error } = await withTimeout(
      supabase.auth.signInWithOtp({
        email: payload.email,
        options: { emailRedirectTo: callbackUrl.toString() }
      }),
      SUPABASE_AUTH_TIMEOUT_MS,
      "Admin sign-in timed out while contacting Supabase."
    );

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid login request."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to start the sign-in flow.";
    const status =
      message === "Missing required environment variable: NEXT_PUBLIC_SITE_URL"
        ? 500
        : message === "A request origin is required when NEXT_PUBLIC_SITE_URL is not configured."
          ? 500
          : message.includes("timed out")
            ? 504
            : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
