"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LoginStep = "credentials" | "mfa_verify" | "mfa_enroll";

export function AdminLoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reason = searchParams.get("reason");
  const mfaParam = searchParams.get("mfa");
  const redirectedFrom = searchParams.get("redirectedFrom");
  const nextPath =
    redirectedFrom && redirectedFrom.startsWith("/admin")
      ? redirectedFrom
      : "/admin";

  async function beginMfaEnrollment() {
    setError(null);
    const enrollRes = await fetch("/api/admin/mfa/enroll", { method: "POST" });
    const enrollPayload = (await enrollRes.json()) as {
      factorId?: string;
      qrCode?: string;
      secret?: string;
      error?: string;
    };

    if (!enrollRes.ok || !enrollPayload.factorId) {
      throw new Error(
        enrollPayload.error ?? "Unable to initialize owner authenticator setup."
      );
    }

    setFactorId(enrollPayload.factorId);
    setQrCodeSvg(enrollPayload.qrCode ?? null);
    setManualSecret(enrollPayload.secret ?? null);
    setStep("mfa_enroll");
  }

  // If redirected with ?mfa=required while already authenticated at AAL1, resume MFA step directly
  useEffect(() => {
    if (mfaParam !== "required") return;
    let active = true;

    async function resumeMfa() {
      try {
        const res = await fetch("/api/admin/mfa/status");
        const data = (await res.json()) as {
          authenticated?: boolean;
          mfaStatus?: "verified" | "verify" | "enroll";
          factorId?: string | null;
        };
        if (!active || !data.authenticated) return;
        if (data.mfaStatus === "verified") {
          router.replace(nextPath);
          return;
        }
        if (data.mfaStatus === "verify" && data.factorId) {
          setFactorId(data.factorId);
          setStep("mfa_verify");
        } else if (data.mfaStatus === "enroll") {
          await beginMfaEnrollment();
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load MFA status."
          );
        }
      }
    }

    void resumeMfa();
    return () => {
      active = false;
    };
  }, [mfaParam, nextPath, router]);

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(email.trim() ? { email: email.trim() } : {}),
          password
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        mfaRequired?: boolean;
        mfaStatus?: "verified" | "verify" | "enroll";
        factorId?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to sign in.");
      }

      if (payload.mfaRequired) {
        if (payload.mfaStatus === "verify" && payload.factorId) {
          setFactorId(payload.factorId);
          setStep("mfa_verify");
          return;
        }
        await beginMfaEnrollment();
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to sign in."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) return;
    setSubmitting(true);
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
      const payload = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error ?? "Invalid 6-digit authenticator code. Try again."
        );
      }

      router.replace(nextPath);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to verify authenticator code."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "mfa_verify" || step === "mfa_enroll") {
    return (
      <form
        onSubmit={handleMfaVerify}
        className="space-y-5 rounded-[2px] border border-text/15 bg-paper p-8 text-text"
      >
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-brass">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Owner Two-Factor Authentication
          </p>
          <h1 className="font-serif text-3xl text-text">
            {step === "mfa_enroll"
              ? "Set up authenticator app"
              : "Verify authenticator code"}
          </h1>
          <p className="text-sm text-muted">
            {step === "mfa_enroll"
              ? "Owner accounts require TOTP MFA. Scan this QR code in Google Authenticator, 1Password, or Authy, then enter the 6-digit code below."
              : "Enter the 6-digit code from your authenticator app to complete sign-in."}
          </p>
        </div>

        {step === "mfa_enroll" && qrCodeSvg ? (
          <div className="space-y-3 border border-text/12 bg-stone p-4">
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
          <span className="block text-text">6-digit code</span>
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

        <Button
          type="submit"
          className="w-full"
          disabled={submitting || totpCode.length !== 6}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Verifying...
            </>
          ) : (
            <>
              <KeyRound className="mr-2 h-4 w-4" aria-hidden />
              Verify &amp; continue
            </>
          )}
        </Button>

        <button
          type="button"
          onClick={() => {
            setStep("credentials");
            setTotpCode("");
            setError(null);
          }}
          className="w-full text-center text-xs text-muted underline underline-offset-4 hover:text-text"
        >
          Back to password sign-in
        </button>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form
      onSubmit={handlePasswordSubmit}
      className="space-y-5 rounded-[2px] border border-text/15 bg-paper p-8 text-text"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brass">
          Admin Access
        </p>
        <h1 className="font-serif text-3xl text-text">Auro Ardon Studio</h1>
        <p className="text-sm text-muted">
          Sign in with your owner or staff account to manage store operations.
        </p>
      </div>

      {reason === "timeout" ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-[2px] border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300"
        >
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Your admin session timed out due to inactivity. Please sign in again.
          </span>
        </div>
      ) : null}

      <label className="block space-y-1.5 text-sm">
        <span className="block text-text">Email address</span>
        <Input
          type="email"
          name="email"
          autoComplete="username"
          placeholder="Owner or staff email (blank defaults to owner)"
          value={email}
          onChange={event => setEmail(event.target.value)}
        />
      </label>

      <label className="block space-y-1.5 text-sm">
        <span className="block text-text">Password</span>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          minLength={8}
          required
        />
      </label>

      <Button type="submit" className="w-full" disabled={submitting || !configured}>
        {submitting ? "Signing in..." : "Sign in"}
      </Button>

      {!configured ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Admin access is not configured in this environment.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
