"use client";

import { useEffect } from "react";

import { Section } from "@/components/storefront/section";
import { Button } from "@/components/ui/button";

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
    <Section containerClassName="max-w-2xl">
      <div className="border border-stone bg-paper p-8">
        <h1 className="font-display text-[32px] font-normal leading-[1.05] tracking-[-0.01em] text-text">
          Something went wrong
        </h1>
        <p className="mt-3 text-base text-muted">
          The page could not load. Check your connection and try again.
        </p>
        <div className="mt-6">
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </div>
    </Section>
  );
}
