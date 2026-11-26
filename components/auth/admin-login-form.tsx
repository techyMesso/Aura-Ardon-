"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminLoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to sign in.");
      }

      const redirectedFrom = searchParams.get("redirectedFrom");
      const nextPath =
        redirectedFrom && redirectedFrom.startsWith("/admin")
          ? redirectedFrom
          : "/admin";

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
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[2px] border border-text/15 bg-paper p-8 text-text"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brass">
          Admin Access
        </p>
        <h1 className="font-serif text-3xl text-text">Auro Ardon Studio</h1>
        <p className="text-sm text-muted">
          Enter the configured Auro Ardon admin password to open store operations.
        </p>
      </div>
      <label className="block space-y-1.5 text-sm">
        <span className="block text-text">Admin password</span>
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
