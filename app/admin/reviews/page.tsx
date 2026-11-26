import { ReviewModerationQueue } from "@/components/admin/review-moderation-queue";
import { listAdminReviews } from "@/lib/data";

export const metadata = {
  title: "Reviews Moderation | Admin",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  const { reviews, counts } = await listAdminReviews("all");

  return (
    <ReviewModerationQueue initialReviews={reviews} initialCounts={counts} />
  );
}

