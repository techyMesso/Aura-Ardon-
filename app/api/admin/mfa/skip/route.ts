import { NextResponse, type NextRequest } from "next/server";

import { recordAuditLog } from "@/lib/audit";
import { resolveUserAdminRole } from "@/lib/auth";
import {
  buildOwnerMfaSkipSessionCookieOptions,
  OWNER_MFA_MAX_SKIPS,
  OWNER_MFA_SKIP_SESSION_COOKIE,
  OWNER_MFA_SKIP_SESSION_VALUE
} from "@/lib/owner-mfa";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IncrementSkipRow {
  previous_count: number;
  new_count: number;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const limit = await checkRateLimit({
    key: `admin-mfa-skip:${ip}`,
    limit: 20,
    windowMs: 10 * 60 * 1000
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": `${limit.retryAfterSeconds}` } }
    );
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const role = await resolveUserAdminRole(user);
    if (role !== "owner") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (typeof supabase.auth.mfa?.listFactors === "function") {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const hasVerifiedFactor = (factorsData?.totp ?? []).some(
        factor => factor.status === "verified"
      );
      if (hasVerifiedFactor) {
        return NextResponse.json({
          ok: true,
          alreadyVerified: true,
          skipCount: 0,
          maxSkips: OWNER_MFA_MAX_SKIPS,
          skipsRemaining: OWNER_MFA_MAX_SKIPS
        });
      }
    }

    const adminSupabase = createAdminSupabaseClient();
    const { data, error } = (await adminSupabase
      .rpc("increment_owner_mfa_skip" as never, {
        p_user_id: user.id,
        p_email: user.email ?? "",
        p_max_skips: OWNER_MFA_MAX_SKIPS
      } as never)
      .single()) as {
      data: IncrementSkipRow | null;
      error: { message?: string } | null;
    };

    if (error || !data) {
      const message = error?.message ?? "Unable to skip two-step login right now.";
      if (message.includes("MFA_SKIP_LIMIT_REACHED")) {
        return NextResponse.json(
          {
            error: `You have already used all ${OWNER_MFA_MAX_SKIPS} two-step login skips. Enable two-step login now to continue.`,
            code: "MFA_SKIP_LIMIT_REACHED",
            skipCount: OWNER_MFA_MAX_SKIPS,
            maxSkips: OWNER_MFA_MAX_SKIPS,
            skipsRemaining: 0
          },
          { status: 403 }
        );
      }
      if (message.includes("FORBIDDEN")) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const previousCount = Number(data.previous_count ?? 0);
    const newCount = Number(data.new_count ?? previousCount + 1);
    const skipsRemaining = Math.max(0, OWNER_MFA_MAX_SKIPS - newCount);

    await recordAuditLog({
      actor: {
        id: user.id,
        email: user.email ?? "owner",
        role: "owner"
      },
      action: "owner_mfa.skipped",
      entity: "admin_user",
      entityId: user.id,
      before: { mfa_skip_count: previousCount },
      after: { mfa_skip_count: newCount, skips_remaining: skipsRemaining }
    });

    const forwardedProto = request.headers.get("x-forwarded-proto");
    const isSecure =
      forwardedProto === "https" || request.nextUrl.protocol === "https:";

    const response = NextResponse.json({
      ok: true,
      skipCount: newCount,
      maxSkips: OWNER_MFA_MAX_SKIPS,
      skipsRemaining,
      skippedThisSession: true
    });

    response.cookies.set(
      OWNER_MFA_SKIP_SESSION_COOKIE,
      OWNER_MFA_SKIP_SESSION_VALUE,
      buildOwnerMfaSkipSessionCookieOptions(isSecure)
    );

    return response;
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to skip two-step login."
      },
      { status: 400 }
    );
  }
}

