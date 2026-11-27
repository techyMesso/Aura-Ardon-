import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { z } from "zod";

import { isOwnerMfaEnforced, resolveUserAdminRole } from "@/lib/auth";
import { getAdminEmail, getSupabaseEnv } from "@/lib/env";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  ADMIN_ACTIVITY_COOKIE,
  buildAdminActivityCookieOptions,
  createAdminActivityToken
} from "@/lib/session-timeout";
import { normalizeSupabaseCookieOptions } from "@/lib/supabase/cookies";

export const runtime = "nodejs";
const SUPABASE_AUTH_TIMEOUT_MS = 8000;
const INVALID_CREDENTIALS = "Invalid email or password.";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").optional(),
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
  const ipRateLimit = await checkRateLimit({
    key: `admin-login:ip:${ip}`,
    limit: 5,
    windowMs: 10 * 60 * 1000
  });

  if (!ipRateLimit.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": `${ipRateLimit.retryAfterSeconds}`
        }
      }
    );
  }

  try {
    const payload = loginSchema.parse(await request.json());
    const loginEmail = (payload.email?.trim() || getAdminEmail()).toLowerCase();

    const emailRateLimit = await checkRateLimit({
      key: `admin-login:email:${loginEmail}`,
      limit: 5,
      windowMs: 10 * 60 * 1000
    });
    if (!emailRateLimit.ok) {
      return NextResponse.json(
        { error: "Too many login attempts for this account. Please wait a few minutes." },
        {
          status: 429,
          headers: {
            "Retry-After": `${emailRateLimit.retryAfterSeconds}`
          }
        }
      );
    }

    const { url, anonKey } = getSupabaseEnv();
    const pendingCookies: Array<{
      name: string;
      value: string;
      options: CookieOptions;
    }> = [];

    const forwardedProto = request.headers.get("x-forwarded-proto");
    const isSecure =
      forwardedProto === "https" || request.nextUrl.protocol === "https:";

    const supabase = createServerClient(url, anonKey, {
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
            pendingCookies.push({ name, value, options: normalizedOptions });
          });
        }
      }
    });

    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({
        email: loginEmail,
        password: payload.password
      }),
      SUPABASE_AUTH_TIMEOUT_MS,
      "Admin sign-in timed out while contacting Supabase."
    );

    if (error || !data.user) {
      return jsonError(INVALID_CREDENTIALS, 401);
    }

    const role = await resolveUserAdminRole(data.user);
    if (!role) {
      await supabase.auth.signOut();
      return jsonError(INVALID_CREDENTIALS, 401);
    }

    let mfaRequired = false;
    let mfaStatus: "verified" | "verify" | "enroll" = "verified";
    let factorId: string | null = null;

    if (role === "owner" && isOwnerMfaEnforced()) {
      const [{ data: aalData }, { data: factorsData }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors()
      ]);

      if (aalData?.currentLevel !== "aal2") {
        mfaRequired = true;
        const verifiedTotp = (factorsData?.totp ?? []).find(
          factor => factor.status === "verified"
        );
        if (verifiedTotp) {
          mfaStatus = "verify";
          factorId = verifiedTotp.id;
        } else {
          mfaStatus = "enroll";
        }
      }
    }

    const response = NextResponse.json({
      ok: true,
      role,
      mfaRequired,
      mfaStatus,
      factorId
    });

    for (const cookie of pendingCookies) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    const activityToken = await createAdminActivityToken(data.user.id);
    response.cookies.set(
      ADMIN_ACTIVITY_COOKIE,
      activityToken,
      buildAdminActivityCookieOptions(isSecure)
    );

    return response;
  } catch (caughtError) {
    if (caughtError instanceof z.ZodError) {
      return jsonError(
        caughtError.issues[0]?.message ?? "Invalid login request.",
        400
      );
    }

    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to sign in.";

    if (message.includes("timed out")) {
      return jsonError(message, 504);
    }

    return jsonError(INVALID_CREDENTIALS, 401);
  }
}
