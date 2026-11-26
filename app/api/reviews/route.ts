import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyDeliveredOrderForReview } from "@/lib/data";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { MAX_REVIEW_PHOTO_BYTES, sanitizeReviewPhoto } from "@/lib/reviews";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_PHOTOS_BUCKET = "review-photos";

const reviewFieldsSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(3, "Enter your order number (e.g. AA-7F3K2).")
    .max(32),
  phone: z
    .string()
    .trim()
    .min(9, "Enter the Kenyan phone number used on your order.")
    .max(30),
  productId: z.string().uuid("Select a valid product from your order."),
  rating: z.coerce
    .number()
    .int("Select a whole star rating between 1 and 5.")
    .min(1, "Select between 1 and 5 stars.")
    .max(5, "Select between 1 and 5 stars."),
  comment: z
    .string()
    .trim()
    .min(5, "Please write at least 5 characters about your piece.")
    .max(1500, "Review text must be 1,500 characters or fewer."),
  website: z.string().optional().default("")
});

async function parseSubmissionBody(request: Request): Promise<{
  fields: Record<string, unknown>;
  photoFile: File | null;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const formData = await request.formData();
    const rawPhoto = formData.get("photo");
    const photoFile =
      rawPhoto instanceof File && rawPhoto.size > 0 ? rawPhoto : null;

    return {
      fields: {
        orderNumber: String(formData.get("orderNumber") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        productId: String(formData.get("productId") ?? ""),
        rating: String(formData.get("rating") ?? ""),
        comment: String(formData.get("comment") ?? ""),
        website: String(formData.get("website") ?? "")
      },
      photoFile
    };
  }

  const json = (await request.json()) as Record<string, unknown>;
  return {
    fields: json,
    photoFile: null
  };
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const ipLimit = await checkRateLimit({
    key: `reviews-submit:ip:${ip}`,
    limit: 5,
    windowMs: 10 * 60 * 1000
  });

  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Too many review submissions. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": `${ipLimit.retryAfterSeconds}` } }
    );
  }

  let uploadedStoragePath: string | null = null;
  const supabase = createAdminSupabaseClient();

  try {
    const { fields, photoFile } = await parseSubmissionBody(request);
    const parsed = reviewFieldsSchema.parse(fields);

    if (parsed.website && parsed.website.trim().length > 0) {
      return NextResponse.json({ error: "Unable to submit review." }, { status: 400 });
    }

    const normalizedPhone = normalizeKenyanPhoneNumber(parsed.phone);

    const phoneLimit = await checkRateLimit({
      key: `reviews-submit:phone:${normalizedPhone}`,
      limit: 5,
      windowMs: 10 * 60 * 1000
    });
    if (!phoneLimit.ok) {
      return NextResponse.json(
        {
          error:
            "Too many review submissions from this phone number. Please wait a few minutes."
        },
        { status: 429, headers: { "Retry-After": `${phoneLimit.retryAfterSeconds}` } }
      );
    }

    // Verify order ownership, delivered status, product membership, and duplicate status BEFORE touching storage
    const verification = await verifyDeliveredOrderForReview(
      parsed.orderNumber,
      normalizedPhone
    );

    if (!verification.ok) {
      return NextResponse.json(
        { error: verification.message },
        { status: verification.reason === "not_delivered" ? 409 : 404 }
      );
    }

    const matchingItem = verification.items.find(
      item => item.productId === parsed.productId
    );
    if (!matchingItem) {
      return NextResponse.json(
        { error: "That product was not part of this delivered order." },
        { status: 400 }
      );
    }

    if (matchingItem.alreadyReviewed) {
      return NextResponse.json(
        { error: "You have already submitted a review for this item on this order." },
        { status: 409 }
      );
    }

    let photoUrl: string | null = null;
    if (photoFile) {
      if (photoFile.size > MAX_REVIEW_PHOTO_BYTES) {
        return NextResponse.json(
          { error: "Review photo must be 5 MB or smaller." },
          { status: 400 }
        );
      }

      const rawBuffer = Buffer.from(await photoFile.arrayBuffer());
      const sanitized = await sanitizeReviewPhoto(rawBuffer);
      const storagePath = `reviews/${parsed.productId}/${randomUUID()}.${sanitized.extension}`;

      const { error: uploadError } = await supabase.storage
        .from(REVIEW_PHOTOS_BUCKET)
        .upload(storagePath, sanitized.buffer, {
          contentType: sanitized.mimeType,
          cacheControl: "31536000",
          upsert: false
        });

      if (uploadError) {
        logger.error("Failed to upload review photo", {
          productId: parsed.productId,
          error: uploadError.message
        });
        return NextResponse.json(
          { error: "Unable to upload review photo right now. Please try again." },
          { status: 500 }
        );
      }

      uploadedStoragePath = storagePath;
      const {
        data: { publicUrl }
      } = supabase.storage.from(REVIEW_PHOTOS_BUCKET).getPublicUrl(storagePath);
      photoUrl = publicUrl;
    }

    const { data: created, error: rpcError } = await supabase.rpc(
      "submit_verified_review" as never,
      {
        p_order_number: verification.orderNumber,
        p_phone: verification.matchedPhone,
        p_product_id: parsed.productId,
        p_rating: parsed.rating,
        p_comment: parsed.comment,
        p_photo_url: photoUrl
      } as never
    );

    if (rpcError || !created) {
      if (uploadedStoragePath) {
        await supabase.storage
          .from(REVIEW_PHOTOS_BUCKET)
          .remove([uploadedStoragePath])
          .catch(() => {});
      }
      const message = rpcError?.message ?? "Unable to save your review.";
      const lower = message.toLowerCase();
      const status = lower.includes("already submitted")
        ? 409
        : lower.includes("only delivered")
          ? 409
          : lower.includes("no order found")
            ? 404
            : 400;
      return NextResponse.json({ error: message }, { status });
    }

    const createdRow = created as {
      id: string;
      status: string;
      rating: number;
      created_at: string;
    };

    return NextResponse.json(
      {
        ok: true,
        review: {
          id: createdRow.id,
          status: createdRow.status,
          rating: Number(createdRow.rating),
          created_at: createdRow.created_at
        },
        message:
          "Thank you! Your verified review has been received and will appear on the product page once approved by our team."
      },
      { status: 201 }
    );
  } catch (caughtError) {
    if (uploadedStoragePath) {
      await supabase.storage
        .from(REVIEW_PHOTOS_BUCKET)
        .remove([uploadedStoragePath])
        .catch(() => {});
    }
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Please check your review details."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to submit your review.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

