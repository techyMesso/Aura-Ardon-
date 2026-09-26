"use client";

import { useEffect } from "react";

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Storefront error boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl space-y-6 rounded-[2rem] border border-border bg-white/75 p-7 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2v2m0 16v2m6-10l-4 4-4-4" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-ink">Something went wrong</h2>
        <p className="text-muted">
          We&apos;re sorry, but something went wrong on our end. Please try again later.
        </p>
        <button
          onClick={() => reset()}
          className="btn-primary"
        >
          Try Again
        </button>
        <p className="text-xs text-muted/60">
          If the problem persists, please contact us on WhatsApp.
        </p>
      </div>
    </div>
  );
}
