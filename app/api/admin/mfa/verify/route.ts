import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { resolveUserAdminRole } from "@/lib/auth";
import { getSupabaseEnv } from "@/lib/env";
import { OWNER_MFA_SKIP_SESSION_COOKIE } from "@/lib/owner-mfa";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  ADMIN_ACTIVITY_COOKIE,
  buildAdminActivityCookieOptions,
  createAdminActivityToken
} from "@/lib/session-timeout";
import { normalizeSupabaseCookieOptions } from "@/lib/supabase/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifyMfaSchema = z.object({
  factorId: z.string().uuid("Invalid authenticator factor ID."),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.")
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const limit = await checkRateLimit({
    key: `admin-mfa-verify:${ip}`,
    limit: 10,
    windowMs: 10 * 60 * 1000
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": `${limit.retryAfterSeconds}` } }
    );
  }

  try {
    const payload = verifyMfaSchema.parse(await request.json());
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

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const role = await resolveUserAdminRole(user);
    if (!role) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: payload.factorId });

    if (challengeError || !challengeData) {
      return NextResponse.json(
        { error: challengeError?.message || "Unable to create MFA challenge." },
        { status: 400 }
      );
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: payload.factorId,
      challengeId: challengeData.id,
      code: payload.code
    });

    if (verifyError) {
      return NextResponse.json(
        { error: "Invalid or expired 6-digit code. Please try again." },
        { status: 401 }
      );
    }

    await recordAuditLog({
      actor: {
        id: user.id,
        email: user.email ?? "owner",
        role
      },
      action: "owner_mfa.verified",
      entity: "admin_user",
      entityId: user.id,
      after: {
        factor_id: payload.factorId,
        aal: "aal2"
      }
    });

    const response = NextResponse.json({ ok: true, role });
    for (const cookie of pendingCookies) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    const activityToken = await createAdminActivityToken(user.id);
    response.cookies.set(
      ADMIN_ACTIVITY_COOKIE,
      activityToken,
      buildAdminActivityCookieOptions(isSecure)
    );
    response.cookies.delete(OWNER_MFA_SKIP_SESSION_COOKIE);

    return response;
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Enter a valid 6-digit code."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to verify code.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

