"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin error boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl space-y-6 border border-border bg-card p-7 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-50">
          <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2v2m0 16v2m6-10l-4 4-4-4" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-ink">Something went wrong</h2>
        <p className="text-muted">
          The workspace could not load. Check your connection, then try again.
        </p>
        <button
          onClick={() => reset()}
          className="btn-primary"
        >
          Try again
        </button>
        <p className="text-xs text-muted/60">
          If the problem persists, please contact the administrator.
        </p>
      </div>
    </div>
  );
}
