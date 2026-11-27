"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  KeyRound,
  Loader2,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  evaluateOwnerMfaState,
  type OwnerMfaState
} from "@/lib/owner-mfa";

interface OwnerMfaBannerProps {
  initialState: OwnerMfaState;
  email?: string | null;
}

export function OwnerMfaBanner({ initialState, email }: OwnerMfaBannerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setupParamRequested = searchParams.get("setupMfa") === "1";

  const [state, setState] = useState<OwnerMfaState>(initialState);
  const [setupOpen, setSetupOpen] = useState<boolean>(setupParamRequested);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  const startEnrollment = useCallback(async () => {
    setSetupOpen(true);
    setEnrolling(true);
    setError(null);
    setTotpCode("");

    try {
      const response = await fetch("/api/admin/mfa/enroll", { method: "POST" });
      const payload = (await response.json()) as {
        factorId?: string;
        qrCode?: string;
        secret?: string;
        error?: string;
      };

      if (!response.ok || !payload.factorId) {
        throw new Error(
          payload.error ?? "Unable to start two-step login setup."
        );
      }

      setFactorId(payload.factorId);
      setQrCodeSvg(payload.qrCode ?? null);
      setManualSecret(payload.secret ?? null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to start two-step login setup."
      );
    } finally {
      setEnrolling(false);
    }
  }, []);

  useEffect(() => {
    if (
      setupParamRequested &&
      state.shouldShowBanner &&
      !factorId &&
      !enrolling
    ) {
      void startEnrollment();
    }
  }, [enrolling, factorId, setupParamRequested, startEnrollment, state.shouldShowBanner]);

  async function handleSkip() {
    if (!state.canSkip || skipping) return;
    setSkipping(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/mfa/skip", { method: "POST" });
      const payload = (await response.json()) as {
        ok?: boolean;
        skipCount?: number;
        maxSkips?: number;
        alreadyVerified?: boolean;
        error?: string;
      };

      if (!response.ok) {
        if (response.status === 403 && typeof payload.skipCount === "number") {
          setState(
            evaluateOwnerMfaState({
              isOwner: true,
              hasVerifiedFactor: false,
              currentLevel: "aal1",
              nextLevel: "aal1",
              skipCount: payload.skipCount,
              skippedThisSession: false,
              maxSkips: payload.maxSkips ?? state.maxSkips
            })
          );
        }
        throw new Error(
          payload.error ?? "Unable to skip two-step login setup."
        );
      }

      if (payload.alreadyVerified) {
        setState(
          evaluateOwnerMfaState({
            isOwner: true,
            hasVerifiedFactor: true,
            currentLevel: "aal2",
            nextLevel: "aal2",
            skipCount: 0,
            skippedThisSession: false
          })
        );
        setSetupOpen(false);
        router.refresh();
        return;
      }

      setState(
        evaluateOwnerMfaState({
          isOwner: true,
          hasVerifiedFactor: false,
          currentLevel: "aal1",
          nextLevel: "aal1",
          skipCount: payload.skipCount ?? state.skipCount + 1,
          skippedThisSession: true,
          maxSkips: payload.maxSkips ?? state.maxSkips
        })
      );
      setSetupOpen(false);
      if (setupParamRequested) {
        router.replace(pathname);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to skip two-step login setup."
      );
    } finally {
      setSkipping(false);
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || totpCode.length !== 6) return;

    setVerifying(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factorId,
          code: totpCode.trim()
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error ?? "Invalid 6-digit code. Please try again."
        );
      }

      setState(
        evaluateOwnerMfaState({
          isOwner: true,
          hasVerifiedFactor: true,
          currentLevel: "aal2",
          nextLevel: "aal2",
          skipCount: 0,
          skippedThisSession: false
        })
      );
      setSetupOpen(false);
      setFactorId(null);
      setQrCodeSvg(null);
      setManualSecret(null);
      setTotpCode("");
      if (setupParamRequested) {
        router.replace(pathname);
      }
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to verify authenticator code."
      );
    } finally {
      setVerifying(false);
    }
  }

  if (!state.shouldShowBanner) {
    return null;
  }

  const showBlockingOverlay = state.isBlocking || setupOpen;

  return (
    <>
      {/* Persistent reminder banner on every admin page during a skipped session */}
      {!showBlockingOverlay ? (
        <div
          role="region"
          aria-label="Two-step login reminder"
          className="mb-4 flex flex-col gap-3 rounded-[2px] border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-text sm:flex-row sm:items-center sm:justify-between print:hidden"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300"
              aria-hidden
            />
            <div>
              <p className="font-semibold text-text">
                Two-step login is not enabled on your owner account
              </p>
              <p className="text-xs text-muted">
                {state.skipsRemaining > 0
                  ? `${state.skipsRemaining} of ${state.maxSkips} skips remaining before two-step login becomes mandatory.`
                  : "You have used all 3 skips — two-step login will be required on your next sign-in."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="h-9 shrink-0 px-3 text-xs"
            onClick={() => void startEnrollment()}
          >
            <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden />
            Enable two-step login
          </Button>
        </div>
      ) : null}

      {/* Blocking banner / dialog on every admin page when not skipped or after 3 skips */}
      {showBlockingOverlay ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-mfa-gate-title"
          className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/75 p-4 backdrop-blur-sm print:hidden"
        >
          <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto border border-brass/50 bg-paper p-6 text-text shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-brass">
                  <ShieldAlert className="h-4 w-4" aria-hidden />
                  Owner security required
                </p>
                <h2
                  id="owner-mfa-gate-title"
                  className="mt-1.5 font-serif text-2xl text-text sm:text-3xl"
                >
                  Enable two-step login
                </h2>
              </div>
              {!state.isBlocking && setupOpen ? (
                <button
                  type="button"
                  aria-label="Close two-step login setup"
                  onClick={() => {
                    setSetupOpen(false);
                    if (setupParamRequested) {
                      router.replace(pathname);
                    }
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] text-muted hover:bg-stone hover:text-text"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              ) : null}
            </div>

            <p className="mt-2 text-sm text-muted">
              Protect {email ? <strong className="text-text">{email}</strong> : "your owner account"} with an authenticator app (Google Authenticator, 1Password, or Authy) so store settings, delivery fees, and customer records stay locked down.
            </p>

            <div
              className={`mt-4 rounded-[2px] border px-3.5 py-2.5 text-xs ${
                state.isHardRequired
                  ? "border-red-400/60 bg-red-500/10 text-red-700 dark:text-red-300"
                  : "border-amber-400/60 bg-amber-500/10 text-amber-900 dark:text-amber-200"
              }`}
            >
              {state.isHardRequired ? (
                <span>
                  <strong>Required now:</strong> You have already skipped two-step
                  login {state.maxSkips} of {state.maxSkips} times. Complete setup
                  below to continue using the admin console.
                </span>
              ) : (
                <span>
                  You can skip this prompt up to {state.maxSkips} times (
                  <strong>
                    {state.skipsRemaining}{" "}
                    {state.skipsRemaining === 1 ? "skip" : "skips"} left
                  </strong>
                  ), after which two-step login is required.
                </span>
              )}
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-4 rounded-[2px] border border-red-400/50 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400"
              >
                {error}
              </p>
            ) : null}

            {!factorId ? (
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                <Button
                  type="button"
                  className="flex-1"
                  disabled={enrolling || skipping}
                  onClick={() => void startEnrollment()}
                >
                  {enrolling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Preparing authenticator...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
                      Enable two-step login
                    </>
                  )}
                </Button>

                {state.canSkip && !state.isHardRequired ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={enrolling || skipping}
                    onClick={() => void handleSkip()}
                  >
                    {skipping
                      ? "Skipping..."
                      : `Skip for now (${state.skipsRemaining} left)`}
                  </Button>
                ) : null}
              </div>
            ) : (
              <form onSubmit={handleVerify} className="mt-5 space-y-4">
                <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
                  <li>Open Google Authenticator, 1Password, or Authy on your phone.</li>
                  <li>Scan the QR code below (or enter the manual setup key).</li>
                  <li>Enter the 6-digit code shown in the app to finish setup.</li>
                </ol>

                {qrCodeSvg ? (
                  <div className="space-y-3 border border-border bg-stone p-4">
                    <div
                      className="mx-auto flex h-44 w-44 items-center justify-center bg-white p-2"
                      dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
                    />
                    {manualSecret ? (
                      <div className="text-center">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
                          Manual setup key
                        </p>
                        <code className="mt-1 block break-all font-mono text-xs text-text">
                          {manualSecret}
                        </code>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium text-text">6-digit code</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="123456"
                    value={totpCode}
                    onChange={event =>
                      setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    required
                  />
                </label>

                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={verifying || totpCode.length !== 6}
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <KeyRound className="mr-2 h-4 w-4" aria-hidden />
                        Verify &amp; enable
                      </>
                    )}
                  </Button>
                  {state.canSkip && !state.isHardRequired ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={verifying || skipping}
                      onClick={() => void handleSkip()}
                    >
                      {skipping
                        ? "Skipping..."
                        : `Skip (${state.skipsRemaining} left)`}
                    </Button>
                  ) : null}
                </div>
              </form>
            )}

            {state.isHardRequired ? (
              <form
                action="/auth/signout"
                method="post"
                className="mt-5 border-t border-border pt-4"
              >
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 text-xs text-muted underline underline-offset-4 hover:text-text"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  Sign out instead
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

