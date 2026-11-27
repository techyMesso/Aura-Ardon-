import { NextResponse } from "next/server";

import { resolveUserAdminRole } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const limit = await checkRateLimit({
    key: `admin-mfa-enroll:${ip}`,
    limit: 10,
    windowMs: 10 * 60 * 1000
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many MFA setup attempts. Please wait a few minutes." },
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
      return NextResponse.json(
        { error: "Owner account required for authenticator setup." },
        { status: 403 }
      );
    }

    // Clean up any stale unverified TOTP factors before enrolling a fresh one
    const { data: existingFactors } = await supabase.auth.mfa.listFactors();
    const unverifiedTotp = (existingFactors?.all ?? []).filter(
      factor => factor.factor_type === "totp" && factor.status === "unverified"
    );
    for (const stale of unverifiedTotp) {
      await supabase.auth.mfa.unenroll({ factorId: stale.id }).catch(() => {});
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Auro Ardon Owner Authenticator"
    });

    if (error || !data) {
      return NextResponse.json(
        {
          error:
            error?.message ||
            "Unable to start TOTP authenticator enrollment. Verify MFA is enabled in Supabase Auth."
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri
    });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to start MFA enrollment."
      },
      { status: 400 }
    );
  }
}

