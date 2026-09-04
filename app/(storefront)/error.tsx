'use client';

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl text-center space-y-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2v2m0 16v2m6-10l-4 4-4-4" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-ink">Something went wrong</h2>
        <p className="text-muted">
          We're sorry, but something went wrong on our end. Please try again later.
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
