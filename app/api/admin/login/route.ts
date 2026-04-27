import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getAdminEmail, getSupabaseEnv } from "@/lib/env";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url()
});

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
    const requestOrigin = request.nextUrl.origin;
    const redirectUrl = new URL(payload.redirectTo);

    if (redirectUrl.origin !== requestOrigin || redirectUrl.pathname !== "/auth/callback") {
      return NextResponse.json(
        { error: "Invalid admin redirect target." },
        { status: 400 }
      );
    }

    if (payload.email.toLowerCase() !== getAdminEmail()) {
      return NextResponse.json(
        { error: "Use the configured admin email address." },
        { status: 403 }
      );
    }

    const { url, anonKey } = getSupabaseEnv();
    const supabase = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { error } = await supabase.auth.signInWithOtp({
      email: payload.email,
      options: { emailRedirectTo: redirectUrl.toString() }
    });

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

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
