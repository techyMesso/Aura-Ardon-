"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-paper px-6 py-16 font-sans text-text">
        <div className="max-w-md space-y-4 border border-text/15 bg-paper p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
            Auro Ardon
          </p>
          <h1 className="font-serif text-3xl text-text">Something went wrong</h1>
          <p className="text-sm text-muted">
            An unexpected error interrupted this page. Our team has been notified automatically.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="btn-primary"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

