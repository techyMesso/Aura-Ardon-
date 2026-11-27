import { NextResponse } from "next/server";

import { isOwnerMfaEnforced, resolveUserAdminRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authenticated: false });
    }

    const role = await resolveUserAdminRole(user);
    if (!role) {
      return NextResponse.json({ authenticated: false });
    }

    if (role !== "owner" || !isOwnerMfaEnforced()) {
      return NextResponse.json({
        authenticated: true,
        role,
        email: user.email,
        mfaStatus: "verified",
        factorId: null
      });
    }

    const [{ data: aalData }, { data: factorsData }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors()
    ]);

    if (aalData?.currentLevel === "aal2") {
      return NextResponse.json({
        authenticated: true,
        role,
        email: user.email,
        mfaStatus: "verified",
        factorId: null
      });
    }

    const verifiedTotp = (factorsData?.totp ?? []).find(
      factor => factor.status === "verified"
    );

    return NextResponse.json({
      authenticated: true,
      role,
      email: user.email,
      mfaStatus: verifiedTotp ? "verify" : "enroll",
      factorId: verifiedTotp?.id ?? null
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}

