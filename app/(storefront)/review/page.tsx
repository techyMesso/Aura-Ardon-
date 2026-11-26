import Link from "next/link";

import { VerifiedReviewForm } from "@/components/storefront/verified-review-form";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Leave a Verified Review",
  description:
    "Verify your delivered Auro Ardon order number and phone number to leave an authentic product review.",
  pathname: "/review"
});

interface ReviewPageProps {
  searchParams: Promise<{ order?: string }>;
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const query = await searchParams;
  const prefilledOrder = query.order?.trim().toUpperCase() ?? "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="mb-8 space-y-2">
        <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-brass">
          Authentic feedback only
        </p>
        <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[52px]">
          Verified buyer review
        </h1>
        <p className="font-sans text-[15px] leading-[1.55] text-muted">
          Every review on Auro Ardon comes from a real delivered order. Enter your order number and phone number to review the pieces you received.
        </p>
      </div>

      <VerifiedReviewForm initialOrderNumber={prefilledOrder} />

      <p className="mt-6 font-sans text-[13px] text-muted">
        Looking for your order status instead?{" "}
        <Link href="/track" className="text-text underline underline-offset-4 hover:text-brass">
          Track your order
        </Link>
        .
      </p>
    </div>
  );
}

