import Link from "next/link";

import { Section } from "@/components/storefront/section";

export default function StorefrontNotFound() {
  return (
    <Section containerClassName="max-w-2xl">
      <div className="border border-stone bg-paper p-8">
        <h1 className="font-display text-[32px] font-normal leading-[1.05] tracking-[-0.01em] text-text">
          Piece not found
        </h1>
        <p className="mt-3 text-base text-muted">
          This page or piece is no longer available.
        </p>
        <div className="mt-6">
          <Link href="/shop" className="btn-primary">
            Shop pieces
          </Link>
        </div>
      </div>
    </Section>
  );
}
