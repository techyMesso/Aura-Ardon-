"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminLoginForm({ adminEmail }: { adminEmail: string }) {
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
      className="space-y-5 rounded-[2rem] border border-white/60 bg-white/70 p-8 shadow-luxe backdrop-blur"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
          Admin Access
        </p>
        <h1 className="font-serif text-3xl text-ink">Secure your atelier</h1>
        <p className="text-sm text-muted">
          Sign in with the Aura Ardon admin password.
        </p>
      </div>
      <input type="hidden" name="email" autoComplete="username" value={adminEmail} readOnly />
      <Input
        type="email"
        value={adminEmail}
        readOnly
        autoComplete="username"
        aria-label="Admin email"
      />
      <Input
        type="password"
        name="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={event => setPassword(event.target.value)}
        minLength={8}
        required
      />
      <Button type="submit" className="w-full" disabled={submitting || !adminEmail}>
        {submitting ? "Signing in..." : "Sign in"}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
