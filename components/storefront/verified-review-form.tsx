"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Camera,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Star,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatProductTitle } from "@/lib/catalog";

export interface ReviewableOrderItem {
  productId: string;
  title: string;
  variantName?: string | null;
  alreadyReviewed?: boolean;
}

interface VerifiedReviewFormProps {
  initialOrderNumber?: string;
  initialPhone?: string;
  initialItems?: ReviewableOrderItem[];
  compact?: boolean;
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function VerifiedReviewForm({
  initialOrderNumber = "",
  initialPhone = "",
  initialItems,
  compact = false
}: VerifiedReviewFormProps) {
  const dedupedInitialItems = useMemo(() => {
    if (!initialItems?.length) return [];
    const seen = new Map<string, ReviewableOrderItem>();
    for (const item of initialItems) {
      if (item.productId && !seen.has(item.productId)) {
        seen.set(item.productId, item);
      }
    }
    return Array.from(seen.values());
  }, [initialItems]);

  const hasPrefilledItems = dedupedInitialItems.length > 0;

  const [orderNumber, setOrderNumber] = useState(
    initialOrderNumber.trim().toUpperCase()
  );
  const [phone, setPhone] = useState(initialPhone);
  const [verifiedOrderNumber, setVerifiedOrderNumber] = useState<string | null>(
    hasPrefilledItems && initialOrderNumber.trim()
      ? initialOrderNumber.trim().toUpperCase()
      : null
  );
  const [items, setItems] = useState<ReviewableOrderItem[]>(dedupedInitialItems);
  const [selectedProductId, setSelectedProductId] = useState<string>(() => {
    const firstEligible = dedupedInitialItems.find(item => !item.alreadyReviewed);
    return firstEligible?.productId ?? dedupedInitialItems[0]?.productId ?? "";
  });

  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const eligibleItems = useMemo(
    () => items.filter(item => !item.alreadyReviewed),
    [items]
  );

  function clearPhoto() {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSubmitFeedback(null);
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      clearPhoto();
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      setSubmitFeedback({
        ok: false,
        message: "Please choose a JPEG, PNG, or WebP photo."
      });
      clearPhoto();
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setSubmitFeedback({
        ok: false,
        message: "Review photo must be 5 MB or smaller."
      });
      clearPhoto();
      return;
    }

    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  async function handleVerifyOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verifying) return;
    setVerifying(true);
    setVerifyError(null);
    setSubmitFeedback(null);

    try {
      const response = await fetch("/api/reviews/verify-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: orderNumber.trim().toUpperCase(),
          phone: phone.trim()
        })
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        orderNumber?: string;
        items?: ReviewableOrderItem[];
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.items) {
        throw new Error(
          payload.error ||
            "No delivered order found matching that order number and phone number."
        );
      }

      setVerifiedOrderNumber(payload.orderNumber || orderNumber.trim().toUpperCase());
      setItems(payload.items);
      const firstOpen = payload.items.find(item => !item.alreadyReviewed);
      setSelectedProductId(firstOpen?.productId ?? payload.items[0]?.productId ?? "");
    } catch (caughtError) {
      setVerifyError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to verify your order."
      );
    } finally {
      setVerifying(false);
    }
  }

  async function handleSubmitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitFeedback(null);

    const activeOrderNumber = (verifiedOrderNumber || orderNumber).trim().toUpperCase();
    if (!activeOrderNumber) {
      setSubmitFeedback({ ok: false, message: "Enter your order number." });
      return;
    }
    if (!phone.trim()) {
      setSubmitFeedback({
        ok: false,
        message: "Enter the Kenyan phone number used when placing this order."
      });
      return;
    }
    if (!selectedProductId) {
      setSubmitFeedback({ ok: false, message: "Select the piece you want to review." });
      return;
    }
    if (comment.trim().length < 5) {
      setSubmitFeedback({
        ok: false,
        message: "Please write at least 5 characters about your piece."
      });
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("orderNumber", activeOrderNumber);
      formData.set("phone", phone.trim());
      formData.set("productId", selectedProductId);
      formData.set("rating", String(rating));
      formData.set("comment", comment.trim());
      formData.set("website", website);
      if (photoFile) {
        formData.set("photo", photoFile);
      }

      const response = await fetch("/api/reviews", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to submit your review.");
      }

      const nextItems = items.map(item =>
        item.productId === selectedProductId
          ? { ...item, alreadyReviewed: true }
          : item
      );
      setItems(nextItems);
      const nextEligible = nextItems.find(item => !item.alreadyReviewed);
      setSelectedProductId(nextEligible?.productId ?? "");
      setComment("");
      setRating(5);
      clearPhoto();
      setSubmitFeedback({
        ok: true,
        message:
          payload.message ||
          "Thank you! Your verified review has been received and will appear once approved."
      });
    } catch (caughtError) {
      setSubmitFeedback({
        ok: false,
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to submit your review right now."
      });
    } finally {
      setSubmitting(false);
    }
  }

  const showStepOne = !verifiedOrderNumber || items.length === 0;

  return (
    <div
      className={
        compact
          ? "space-y-5"
          : "space-y-6 border border-text/12 bg-paper p-5 sm:p-7"
      }
    >
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 text-price">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em]">
            Verified buyer review
          </span>
        </div>
        <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text sm:text-[30px]">
          Share your experience
        </h2>
        <p className="font-sans text-[14px] leading-[1.5] text-muted">
          Only delivered Auro Ardon orders can leave a review. Every review is checked by our team before publishing.
        </p>
      </div>

      {showStepOne ? (
        <form onSubmit={handleVerifyOrder} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">Order number</span>
              <Input
                required
                placeholder="AA-7F3K2"
                value={orderNumber}
                onChange={event => setOrderNumber(event.target.value.toUpperCase())}
              />
            </label>

            <label className="block font-sans text-[14px]">
              <span className="mb-1.5 block text-text">Phone number</span>
              <Input
                required
                type="tel"
                inputMode="tel"
                placeholder="0712 345 678 or +254..."
                value={phone}
                onChange={event => setPhone(event.target.value)}
              />
            </label>
          </div>

          {verifyError ? (
            <p
              role="alert"
              className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-3.5 py-2.5 font-sans text-[13px] text-red-600 dark:text-red-400"
            >
              {verifyError}
            </p>
          ) : null}

          <Button type="submit" disabled={verifying} className="w-full sm:w-auto">
            {verifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Checking delivered order...
              </>
            ) : (
              "Verify delivered order"
            )}
          </Button>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border border-text/12 bg-stone px-3.5 py-2.5 font-sans text-[13px]">
            <span className="text-text">
              Order <strong className="font-semibold">{verifiedOrderNumber}</strong>
            </span>
            {!hasPrefilledItems ? (
              <button
                type="button"
                onClick={() => {
                  setVerifiedOrderNumber(null);
                  setItems([]);
                  setSubmitFeedback(null);
                }}
                className="text-xs font-medium text-[#7A5D1D] underline underline-offset-4 hover:text-text dark:text-price"
              >
                Use another order
              </button>
            ) : null}
          </div>

          {submitFeedback ? (
            <div
              role={submitFeedback.ok ? "status" : "alert"}
              className={`flex items-start gap-2.5 rounded-[2px] border px-4 py-3 font-sans text-[14px] ${
                submitFeedback.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-red-400/50 bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {submitFeedback.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : null}
              <span>{submitFeedback.message}</span>
            </div>
          ) : null}

          {eligibleItems.length === 0 ? (
            <p className="font-sans text-[14px] text-muted">
              All items on order <strong className="text-text">{verifiedOrderNumber}</strong> have already been reviewed. Thank you for sharing your feedback!
            </p>
          ) : (
            <form onSubmit={handleSubmitReview} className="space-y-5" noValidate>
              {/* Silent honeypot */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
              >
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={event => setWebsite(event.target.value)}
                />
              </div>

              {hasPrefilledItems && !initialPhone.trim() ? (
                <label className="block font-sans text-[14px]">
                  <span className="mb-1.5 block text-text">
                    Phone number used on this order
                  </span>
                  <Input
                    required
                    type="tel"
                    inputMode="tel"
                    placeholder="0712 345 678 or +254..."
                    value={phone}
                    onChange={event => setPhone(event.target.value)}
                  />
                  <span className="mt-1 block text-[12px] text-muted">
                    Confirms you are the verified buyer for order {verifiedOrderNumber}.
                  </span>
                </label>
              ) : null}

              <div className="space-y-2">
                <span className="block font-sans text-[14px] text-text">
                  Which piece are you reviewing?
                </span>
                <div className="grid gap-2">
                  {items.map(item => {
                    const selected = selectedProductId === item.productId;
                    return (
                      <button
                        key={item.productId}
                        type="button"
                        disabled={item.alreadyReviewed}
                        onClick={() => setSelectedProductId(item.productId)}
                        className={`flex min-h-11 items-center justify-between gap-3 rounded-[2px] border px-3.5 py-2 text-left font-sans text-[14px] transition ${
                          item.alreadyReviewed
                            ? "cursor-not-allowed border-text/10 bg-stone/50 text-muted opacity-65"
                            : selected
                              ? "border-brass bg-stone font-medium text-text ring-1 ring-brass"
                              : "border-text/20 bg-paper text-text hover:border-brass/70"
                        }`}
                      >
                        <span className="truncate">
                          {formatProductTitle(item.title)}
                          {item.variantName ? ` — ${item.variantName}` : ""}
                        </span>
                        {item.alreadyReviewed ? (
                          <span className="shrink-0 text-[12px] text-muted">
                            Reviewed
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="block font-sans text-[14px] text-text">
                  Your rating
                </span>
                <div
                  role="radiogroup"
                  aria-label="Star rating"
                  className="flex items-center gap-1.5"
                >
                  {[1, 2, 3, 4, 5].map(starValue => {
                    const active = starValue <= rating;
                    return (
                      <button
                        key={starValue}
                        type="button"
                        role="radio"
                        aria-checked={rating === starValue}
                        aria-label={`${starValue} ${starValue === 1 ? "star" : "stars"}`}
                        onClick={() => setRating(starValue)}
                        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-[2px] border border-text/15 bg-paper transition hover:border-brass focus:outline-none focus:ring-2 focus:ring-brass"
                      >
                        <Star
                          className={`h-5 w-5 ${
                            active
                              ? "fill-brass text-brass"
                              : "text-muted/50"
                          }`}
                          aria-hidden
                        />
                      </button>
                    );
                  })}
                  <span className="ml-2 font-sans text-[13px] text-muted">
                    {rating} / 5
                  </span>
                </div>
              </div>

              <label className="block font-sans text-[14px]">
                <span className="mb-1.5 flex items-baseline justify-between gap-2 text-text">
                  <span>Your review</span>
                  <span className="text-[12px] text-muted">
                    {comment.trim().length} / 1500
                  </span>
                </span>
                <textarea
                  required
                  rows={4}
                  minLength={5}
                  maxLength={1500}
                  placeholder="Tell other Nairobi shoppers about the finish, fit, packaging, or delivery..."
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  className="w-full rounded-[2px] border border-text/20 bg-paper px-3 py-2.5 font-sans text-[14px] leading-[1.5] text-text placeholder:text-muted focus:border-brass focus:outline-none"
                />
              </label>

              <div className="space-y-2">
                <span className="block font-sans text-[14px] text-text">
                  Add a photo (optional)
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[2px] border border-text/20 bg-paper px-3.5 py-2 font-sans text-[13px] text-text transition hover:border-price hover:text-price">
                    <Camera className="h-4 w-4" aria-hidden />
                    <span>{photoFile ? "Change photo" : "Upload photo"}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoChange}
                      className="sr-only"
                    />
                  </label>
                  <span className="font-sans text-[12px] text-muted">
                    JPEG, PNG, or WebP · max 5 MB · EXIF location data stripped automatically
                  </span>
                </div>

                {photoPreviewUrl ? (
                  <div className="relative mt-2 inline-block h-24 w-24 overflow-hidden border border-text/15 bg-stone">
                    <Image
                      src={photoPreviewUrl}
                      alt="Selected review photo preview"
                      fill
                      unoptimized
                      sizes="96px"
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearPhoto}
                      aria-label="Remove selected photo"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-[2px] bg-ink/85 text-paper hover:bg-ink"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                ) : null}
              </div>

              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Submitting review...
                  </>
                ) : (
                  "Submit verified review"
                )}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
