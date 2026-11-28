"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminLoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reason = searchParams.get("reason");
  const redirectedFrom = searchParams.get("redirectedFrom");
  const nextPath =
    redirectedFrom && redirectedFrom.startsWith("/admin")
      ? redirectedFrom
      : "/admin";

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
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to sign in.");
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
