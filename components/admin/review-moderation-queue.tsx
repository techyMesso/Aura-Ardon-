"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Star,
  XCircle
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatProductTitle } from "@/lib/catalog";
import type { AdminReviewRecord, ReviewStatus } from "@/lib/types";

interface ReviewCounts {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

interface ReviewModerationQueueProps {
  initialReviews: AdminReviewRecord[];
  initialCounts: ReviewCounts;
}

type StatusTab = "pending" | "approved" | "rejected" | "all";

function formatNairobiDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-[2px] border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-[2px] border border-red-400/50 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-[2px] border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
      Pending
    </span>
  );
}

export function ReviewModerationQueue({
  initialReviews,
  initialCounts
}: ReviewModerationQueueProps) {
  const [reviews, setReviews] = useState<AdminReviewRecord[]>(initialReviews);
  const [counts, setCounts] = useState<ReviewCounts>(initialCounts);
  const [activeTab, setActiveTab] = useState<StatusTab>(
    initialCounts.pending > 0 ? "pending" : "all"
  );
  const [notesById, setNotesById] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const review of initialReviews) {
      if (review.moderation_note) map[review.id] = review.moderation_note;
    }
    return map;
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const visibleReviews = useMemo(() => {
    if (activeTab === "all") return reviews;
    return reviews.filter(review => review.status === activeTab);
  }, [activeTab, reviews]);

  async function refreshReviews() {
    setRefreshing(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/reviews?status=all");
      const payload = (await response.json()) as {
        reviews?: AdminReviewRecord[];
        counts?: ReviewCounts;
        error?: string;
      };
      if (!response.ok || !payload.reviews || !payload.counts) {
        throw new Error(payload.error || "Unable to refresh reviews.");
      }
      setReviews(payload.reviews);
      setCounts(payload.counts);
    } catch (caughtError) {
      setFeedback({
        ok: false,
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to refresh reviews."
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleModerate(
    reviewId: string,
    nextStatus: "approved" | "rejected"
  ) {
    setBusyId(reviewId);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          moderationNote: notesById[reviewId]?.trim() || null
        })
      });

      const payload = (await response.json()) as {
        review?: AdminReviewRecord;
        error?: string;
      };

      if (!response.ok || !payload.review) {
        throw new Error(payload.error || "Unable to update review status.");
      }

      const updatedReviews = reviews.map(item =>
        item.id === reviewId
          ? {
              ...item,
              status: nextStatus,
              moderated_by: payload.review?.moderated_by ?? item.moderated_by,
              moderated_at: payload.review?.moderated_at ?? new Date().toISOString(),
              moderation_note:
                payload.review?.moderation_note ?? (notesById[reviewId]?.trim() || null)
            }
          : item
      );

      const nextCounts: ReviewCounts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        total: updatedReviews.length
      };
      for (const item of updatedReviews) {
        if (item.status === "pending") nextCounts.pending += 1;
        else if (item.status === "approved") nextCounts.approved += 1;
        else if (item.status === "rejected") nextCounts.rejected += 1;
      }

      setReviews(updatedReviews);
      setCounts(nextCounts);
      setFeedback({
        ok: true,
        message:
          nextStatus === "approved"
            ? "Review approved and published to the storefront."
            : "Review rejected and kept hidden from the storefront."
      });
    } catch (caughtError) {
      setFeedback({
        ok: false,
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to moderate review."
      });
    } finally {
      setBusyId(null);
    }
  }

  const tabs: Array<{ id: StatusTab; label: string; count: number }> = [
    { id: "pending", label: "Pending", count: counts.pending },
    { id: "approved", label: "Approved", count: counts.approved },
    { id: "rejected", label: "Rejected", count: counts.rejected },
    { id: "all", label: "All", count: counts.total }
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-brass">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Verified buyers only
          </p>
          <h2 className="mt-1 font-serif text-3xl text-text sm:text-4xl">
            Review moderation queue
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Only customers with a delivered order can submit reviews. Reviews stay hidden from product pages and Google rich snippets until you approve them here.
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          disabled={refreshing}
          onClick={() => void refreshReviews()}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden
          />
          Refresh
        </Button>
      </section>

      <div
        role="tablist"
        aria-label="Filter reviews by moderation status"
        className="flex flex-wrap gap-2"
      >
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-[2px] border px-3.5 text-sm font-medium transition ${
                active
                  ? "border-brass bg-brass text-ink"
                  : "border-border bg-paper text-muted hover:text-text"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-[2px] px-1.5 py-0.5 text-xs ${
                  active ? "bg-ink/15 text-ink" : "bg-stone text-text"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {feedback ? (
        <div
          role={feedback.ok ? "status" : "alert"}
          className={`rounded-[2px] border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-red-400/50 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {visibleReviews.length === 0 ? (
        <div className="border border-border bg-paper p-8 text-center">
          <p className="font-serif text-2xl text-text">
            {activeTab === "pending"
              ? "No reviews awaiting moderation"
              : "No reviews in this tab yet"}
          </p>
          <p className="mt-2 text-sm text-muted">
            When customers submit verified reviews after delivery, they will appear here for approval.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleReviews.map(review => {
            const isBusy = busyId === review.id;
            const productHref = `/p/${encodeURIComponent(
              review.product_slug || review.product_id
            )}`;

            return (
              <article
                key={review.id}
                className="space-y-4 border border-border bg-paper p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={review.status} />
                      <div
                        className="inline-flex items-center gap-0.5"
                        aria-label={`${review.rating} out of 5 stars`}
                      >
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= review.rating
                                ? "fill-brass text-brass"
                                : "text-muted/35"
                            }`}
                            aria-hidden
                          />
                        ))}
                      </div>
                      <span className="text-xs font-medium text-text">
                        {review.rating} / 5
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Link
                        href={productHref}
                        target="_blank"
                        className="inline-flex items-center gap-1 font-medium text-text hover:text-brass"
                      >
                        {formatProductTitle(review.product_title)}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                      <span className="text-muted">·</span>
                      <Link
                        href={`/admin/orders?order=${review.order_id}`}
                        className="font-medium text-brass hover:underline"
                      >
                        Order {review.order_number}
                      </Link>
                    </div>
                  </div>

                  <div className="text-right text-xs text-muted">
                    <p className="font-medium text-text">{review.customer_name}</p>
                    <p>{review.customer_phone}</p>
                    <p className="mt-0.5">{formatNairobiDateTime(review.created_at)}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="whitespace-pre-line text-sm leading-relaxed text-text">
                      {review.comment}
                    </p>
                    {review.moderated_at ? (
                      <p className="text-xs text-muted">
                        Last moderated by {review.moderated_by || "admin"} on{" "}
                        {formatNairobiDateTime(review.moderated_at)}
                      </p>
                    ) : null}
                  </div>

                  {review.photo_url ? (
                    <a
                      href={review.photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative block h-28 w-28 shrink-0 overflow-hidden border border-border bg-stone"
                      aria-label="Open customer review photo in new tab"
                    >
                      <Image
                        src={review.photo_url}
                        alt={`Review photo by ${review.customer_name}`}
                        fill
                        sizes="112px"
                        className="object-cover"
                      />
                    </a>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-xs text-muted">
                    <span className="mb-1 block">Internal moderation note (optional)</span>
                    <Input
                      placeholder="e.g. Verified real buyer photo, or reason for rejection"
                      value={notesById[review.id] ?? ""}
                      onChange={event =>
                        setNotesById(prev => ({
                          ...prev,
                          [review.id]: event.target.value
                        }))
                      }
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={isBusy || review.status === "approved"}
                      onClick={() => void handleModerate(review.id, "approved")}
                    >
                      {isBusy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                      )}
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isBusy || review.status === "rejected"}
                      onClick={() => void handleModerate(review.id, "rejected")}
                    >
                      <XCircle className="mr-2 h-4 w-4" aria-hidden />
                      Reject
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

