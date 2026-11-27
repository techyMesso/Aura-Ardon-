import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { getAdminEmail } from "@/lib/env";
import {
  evaluateOwnerMfaState,
  OWNER_MFA_SKIP_SESSION_COOKIE,
  OWNER_MFA_SKIP_SESSION_VALUE,
  type OwnerMfaState
} from "@/lib/owner-mfa";
import {
  ADMIN_ACTIVITY_COOKIE,
  verifyAdminActivityToken
} from "@/lib/session-timeout";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Product, ProductVariant } from "@/lib/types";

export type AdminRole = "owner" | "staff";

export interface AuthenticatedAdminUser extends User {
  adminRole?: AdminRole;
}

export function isOwnerMfaEnforced(): boolean {
  return process.env.OWNER_MFA_REQUIRED?.trim().toLowerCase() !== "false";
}

export function getAuthErrorStatus(message: string): number {
  if (message === "UNAUTHORIZED" || message === "SESSION_EXPIRED") {
    return 401;
  }
  if (message === "FORBIDDEN" || message === "MFA_REQUIRED") {
    return 403;
  }
  return 400;
}

function matchesOptionalAdminEmail(email: string | null | undefined) {
  const configured = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(configured && email && email.toLowerCase() === configured);
}

/**
 * Synchronous role resolution from JWT app_metadata.role and configured ADMIN_EMAIL.
 * Never trusts user-editable user_metadata.
 */
export function getAdminRole(
  user: Pick<User, "email" | "app_metadata"> | null | undefined
): AdminRole | null {
  if (!user) return null;
  const metaRole =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role.toLowerCase()
      : null;

  if (metaRole === "staff") return "staff";
  if (metaRole === "owner" || matchesOptionalAdminEmail(user.email)) return "owner";
  return null;
}

export function isOwnerUser(
  user:
    | (Pick<User, "email" | "app_metadata"> & { adminRole?: AdminRole })
    | null
    | undefined
): boolean {
  if (!user) return false;
  if (user.adminRole) return user.adminRole === "owner";
  return getAdminRole(user) === "owner";
}

export function buildAuditActor(
  user:
    | (Pick<User, "id" | "email" | "app_metadata"> & { adminRole?: AdminRole })
    | null
    | undefined
): { id: string | null; email: string; role: AdminRole } {
  const role = user?.adminRole ?? getAdminRole(user) ?? "owner";
  return {
    id: user?.id ?? null,
    email: user?.email ?? user?.id ?? "admin",
    role
  };
}

/**
 * Authoritative role check against public.admin_users (with safe fallback to signed app_metadata / ADMIN_EMAIL).
 * Explicitly revokes access if a user is marked active = false in public.admin_users.
 */
export async function resolveUserAdminRole(
  user: Pick<User, "id" | "email" | "app_metadata"> | null | undefined
): Promise<AdminRole | null> {
  if (!user) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const canQueryAdminUsers = Boolean(
    user.id &&
      serviceKey &&
      serviceKey !== "staging-build-check-placeholder" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL
  );

  if (canQueryAdminUsers) {
    try {
      const adminSupabase = createAdminSupabaseClient();
      const table = adminSupabase.from("admin_users");
      if (table && typeof table.select === "function") {
        const { data } = await table
          .select("role, active")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          const row = data as { role?: string; active?: boolean };
          if (row.active === false) {
            return null;
          }
          if (row.role === "owner" || row.role === "staff") {
            return row.role;
          }
        }
      }
    } catch {
      // Fallback to JWT/env resolution if DB lookup is mocked or unavailable
    }
  }

  const fallbackRole = getAdminRole(user);
  if (fallbackRole) return fallbackRole;

  try {
    if (user.email && user.email.toLowerCase() === getAdminEmail()) {
      return "owner";
    }
  } catch {
    // ADMIN_EMAIL not configured
  }

  return null;
}

export function stripVariantCostPrice<T extends Partial<ProductVariant>>(
  variant: T
): Omit<T, "cost_price"> {
  const clone = { ...variant };
  delete clone.cost_price;
  return clone;
}

export function stripProductCostPrice<T extends Partial<Product>>(
  product: T
): Omit<T, "cost_price"> {
  const clone = { ...product };
  delete clone.cost_price;
  if (Array.isArray(clone.variants)) {
    clone.variants = clone.variants.map(variant =>
      stripVariantCostPrice(variant)
    ) as ProductVariant[];
  }
  return clone;
}

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
}

interface AdminSessionCheckResult {
  user: AuthenticatedAdminUser | null;
  role: AdminRole | null;
  errorCode: "UNAUTHORIZED" | "SESSION_EXPIRED" | "MFA_REQUIRED" | null;
}

export async function getOwnerMfaSkipCount(userId: string): Promise<number> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const canQuery = Boolean(
    userId &&
      serviceKey &&
      serviceKey !== "staging-build-check-placeholder" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  if (!canQuery) return 0;

  try {
    const adminSupabase = createAdminSupabaseClient();
    const table = adminSupabase.from("admin_users");
    if (!table || typeof table.select !== "function") return 0;
    const { data } = await table
      .select("mfa_skip_count")
      .eq("user_id", userId)
      .maybeSingle();
    const count = Number((data as { mfa_skip_count?: unknown } | null)?.mfa_skip_count ?? 0);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  } catch {
    return 0;
  }
}

export async function getCurrentOwnerMfaState(
  user: AuthenticatedAdminUser | null | undefined
): Promise<OwnerMfaState> {
  if (!user || !isOwnerUser(user)) {
    return evaluateOwnerMfaState({
      isOwner: false,
      hasVerifiedFactor: true,
      skipCount: 0,
      skippedThisSession: false
    });
  }

  let currentLevel: "aal1" | "aal2" | null = "aal1";
  let nextLevel: "aal1" | "aal2" | null = "aal1";
  let hasVerifiedFactor = false;

  try {
    const supabase = await createServerSupabaseClient();
    if (typeof supabase.auth.mfa?.getAuthenticatorAssuranceLevel === "function") {
      const { data: aalData } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel === "aal1" || aalData?.currentLevel === "aal2") {
        currentLevel = aalData.currentLevel;
      }
      if (aalData?.nextLevel === "aal1" || aalData?.nextLevel === "aal2") {
        nextLevel = aalData.nextLevel;
      }
      if (currentLevel === "aal2" || nextLevel === "aal2") {
        hasVerifiedFactor = true;
      }
    }

    if (!hasVerifiedFactor && typeof supabase.auth.mfa?.listFactors === "function") {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      hasVerifiedFactor = (factorsData?.totp ?? []).some(
        factor => factor.status === "verified"
      );
    }
  } catch {
    // Keep conservative default (not verified) if MFA check fails
  }

  let skippedThisSession = false;
  try {
    const cookieStore = await cookies();
    skippedThisSession =
      cookieStore.get(OWNER_MFA_SKIP_SESSION_COOKIE)?.value ===
      OWNER_MFA_SKIP_SESSION_VALUE;
  } catch {
    // Outside request cookie context
  }

  const skipCount = hasVerifiedFactor ? 0 : await getOwnerMfaSkipCount(user.id);

  return evaluateOwnerMfaState({
    isOwner: true,
    hasVerifiedFactor,
    currentLevel,
    nextLevel,
    skipCount,
    skippedThisSession
  });
}

async function inspectCurrentAdminSession(options?: {
  allowUnenrolledOwnerPage?: boolean;
}): Promise<AdminSessionCheckResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, role: null, errorCode: "UNAUTHORIZED" };
  }

  const role = await resolveUserAdminRole(user);
  if (!role) {
    return { user: null, role: null, errorCode: "UNAUTHORIZED" };
  }

  // Enforce inactivity timeout when the signed activity cookie is present
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    cookieStore = await cookies();
    const activityCookie = cookieStore.get(ADMIN_ACTIVITY_COOKIE)?.value;
    if (activityCookie) {
      const check = await verifyAdminActivityToken({
        token: activityCookie,
        userId: user.id
      });
      if (!check.valid || check.expired) {
        await supabase.auth.signOut().catch(() => {});
        return { user: null, role: null, errorCode: "SESSION_EXPIRED" };
      }
    }
  } catch {
    // Outside request cookie context (e.g. unit test without cookies())
  }

  // Enforce Supabase TOTP MFA for owner accounts:
  // 1. If a verified TOTP factor exists (nextLevel === "aal2") and session is still AAL1 -> require AAL2 verification.
  // 2. If NO verified TOTP factor exists (nextLevel !== "aal2") -> allow up to 3 skips via the admin blocking banner;
  //    once all 3 skips are exhausted (and not in an active skipped session), block API calls with MFA_REQUIRED while
  //    letting admin pages render the non-dismissible enrollment gate.
  if (
    role === "owner" &&
    typeof supabase.auth.mfa?.getAuthenticatorAssuranceLevel === "function"
  ) {
    const { data: aalData } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData && aalData.currentLevel !== "aal2") {
      if (aalData.nextLevel === "aal2") {
        if (isOwnerMfaEnforced()) {
          return {
            user: Object.assign(user, { adminRole: role }),
            role,
            errorCode: "MFA_REQUIRED"
          };
        }
      } else if (!options?.allowUnenrolledOwnerPage) {
        const skippedMfaThisSession =
          cookieStore?.get(OWNER_MFA_SKIP_SESSION_COOKIE)?.value ===
          OWNER_MFA_SKIP_SESSION_VALUE;
        const skipCount = await getOwnerMfaSkipCount(user.id);
        const mfaState = evaluateOwnerMfaState({
          isOwner: true,
          hasVerifiedFactor: false,
          currentLevel: "aal1",
          nextLevel: "aal1",
          skipCount,
          skippedThisSession: skippedMfaThisSession
        });
        if (mfaState.isHardRequired) {
          return {
            user: Object.assign(user, { adminRole: role }),
            role,
            errorCode: "MFA_REQUIRED"
          };
        }
      }
    }
  }

  return {
    user: Object.assign(user, { adminRole: role }),
    role,
    errorCode: null
  };
}

export async function requireAdminPage(options?: {
  requiredRole?: AdminRole;
}): Promise<AuthenticatedAdminUser> {
  const session = await inspectCurrentAdminSession({
    allowUnenrolledOwnerPage: true
  });

  if (session.errorCode === "SESSION_EXPIRED") {
    redirect("/login?reason=timeout");
  }

  if (!session.user || !session.role) {
    redirect("/login");
  }

  if (session.errorCode === "MFA_REQUIRED") {
    redirect("/login?mfa=required");
  }

  if (options?.requiredRole === "owner" && session.role !== "owner") {
    redirect("/admin?denied=owner");
  }

  return session.user;
}

export async function requireOwnerPage(): Promise<AuthenticatedAdminUser> {
  return requireAdminPage({ requiredRole: "owner" });
}

export async function assertAdminRequest(options?: {
  requiredRole?: AdminRole;
}): Promise<AuthenticatedAdminUser> {
  const session = await inspectCurrentAdminSession();

  if (session.errorCode === "SESSION_EXPIRED") {
    throw new Error("SESSION_EXPIRED");
  }

  if (!session.user || !session.role) {
    throw new Error("UNAUTHORIZED");
  }

  if (session.errorCode === "MFA_REQUIRED") {
    throw new Error("MFA_REQUIRED");
  }

  if (options?.requiredRole === "owner" && session.role !== "owner") {
    throw new Error("FORBIDDEN");
  }

  return session.user;
}

export async function assertOwnerRequest(): Promise<AuthenticatedAdminUser> {
  return assertAdminRequest({ requiredRole: "owner" });
}
