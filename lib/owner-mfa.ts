export const OWNER_MFA_MAX_SKIPS = 3;
export const OWNER_MFA_SKIP_SESSION_COOKIE = "aa_mfa_skip_session";
export const OWNER_MFA_SKIP_SESSION_VALUE = "1";

export interface OwnerMfaState {
  isOwner: boolean;
  hasVerifiedFactor: boolean;
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  skipCount: number;
  maxSkips: number;
  skipsRemaining: number;
  skippedThisSession: boolean;
  canSkip: boolean;
  shouldShowBanner: boolean;
  isBlocking: boolean;
  isHardRequired: boolean;
}

export interface EvaluateOwnerMfaInput {
  isOwner: boolean;
  hasVerifiedFactor: boolean;
  currentLevel?: "aal1" | "aal2" | null;
  nextLevel?: "aal1" | "aal2" | null;
  skipCount: number;
  skippedThisSession: boolean;
  maxSkips?: number;
}

export function evaluateOwnerMfaState(
  input: EvaluateOwnerMfaInput
): OwnerMfaState {
  const maxSkips = Math.max(0, input.maxSkips ?? OWNER_MFA_MAX_SKIPS);
  const safeSkipCount = Math.max(0, Math.floor(Number(input.skipCount) || 0));
  const skipsRemaining = Math.max(0, maxSkips - safeSkipCount);

  if (!input.isOwner || input.hasVerifiedFactor) {
    return {
      isOwner: input.isOwner,
      hasVerifiedFactor: input.hasVerifiedFactor,
      currentLevel: input.currentLevel ?? null,
      nextLevel: input.nextLevel ?? null,
      skipCount: safeSkipCount,
      maxSkips,
      skipsRemaining,
      skippedThisSession: false,
      canSkip: false,
      shouldShowBanner: false,
      isBlocking: false,
      isHardRequired: false
    };
  }

  const skippedThisSession =
    Boolean(input.skippedThisSession) && safeSkipCount <= maxSkips && safeSkipCount > 0;
  const canSkip = safeSkipCount < maxSkips;
  const isHardRequired = safeSkipCount >= maxSkips && !skippedThisSession;
  const isBlocking = !skippedThisSession;

  return {
    isOwner: true,
    hasVerifiedFactor: false,
    currentLevel: input.currentLevel ?? "aal1",
    nextLevel: input.nextLevel ?? "aal1",
    skipCount: safeSkipCount,
    maxSkips,
    skipsRemaining,
    skippedThisSession,
    canSkip,
    shouldShowBanner: true,
    isBlocking,
    isHardRequired
  };
}

export function buildOwnerMfaSkipSessionCookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecure,
    path: "/"
  };
}

