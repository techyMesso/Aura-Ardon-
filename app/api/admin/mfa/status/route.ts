import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getOwnerMfaSkipCount,
  isOwnerMfaEnforced,
  resolveUserAdminRole
} from "@/lib/auth";
import {
  evaluateOwnerMfaState,
  OWNER_MFA_SKIP_SESSION_COOKIE,
  OWNER_MFA_SKIP_SESSION_VALUE
} from "@/lib/owner-mfa";
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

    if (role !== "owner") {
      return NextResponse.json({
        authenticated: true,
        role,
        email: user.email,
        mfaStatus: "verified",
        factorId: null,
        ...evaluateOwnerMfaState({
          isOwner: false,
          hasVerifiedFactor: true,
          skipCount: 0,
          skippedThisSession: false
        })
      });
    }

    const [{ data: aalData }, { data: factorsData }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors()
    ]);

    const verifiedTotp = (factorsData?.totp ?? []).find(
      factor => factor.status === "verified"
    );
    const hasVerifiedFactor = Boolean(
      verifiedTotp ||
        aalData?.currentLevel === "aal2" ||
        aalData?.nextLevel === "aal2"
    );

    let skippedThisSession = false;
    try {
      const cookieStore = await cookies();
      skippedThisSession =
        cookieStore.get(OWNER_MFA_SKIP_SESSION_COOKIE)?.value ===
        OWNER_MFA_SKIP_SESSION_VALUE;
    } catch {
      // Ignore outside request cookie context
    }

    const skipCount = hasVerifiedFactor ? 0 : await getOwnerMfaSkipCount(user.id);
    const bannerState = evaluateOwnerMfaState({
      isOwner: true,
      hasVerifiedFactor,
      currentLevel:
        aalData?.currentLevel === "aal2" ? "aal2" : "aal1",
      nextLevel:
        aalData?.nextLevel === "aal2" ? "aal2" : "aal1",
      skipCount,
      skippedThisSession
    });

    if (aalData?.currentLevel === "aal2" || (hasVerifiedFactor && !isOwnerMfaEnforced())) {
      return NextResponse.json({
        authenticated: true,
        role,
        email: user.email,
        mfaStatus: "verified",
        factorId: verifiedTotp?.id ?? null,
        ...bannerState
      });
    }

    return NextResponse.json({
      authenticated: true,
      role,
      email: user.email,
      mfaStatus: verifiedTotp ? "verify" : "enroll",
      factorId: verifiedTotp?.id ?? null,
      ...bannerState
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
