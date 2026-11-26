import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { revalidateReviews } from "@/lib/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid("Invalid review ID.");

const moderateReviewSchema = z.object({
  status: z.enum(["approved", "rejected"], {
    message: "Status must be 'approved' or 'rejected'."
  }),
  moderationNote: z.string().trim().max(500).optional().nullable()
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = await params;
    const reviewId = uuidSchema.parse(id);
    const payload = moderateReviewSchema.parse(await request.json());

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("reviews")
      .update({
        status: payload.status,
        moderated_by: adminUser?.email ?? adminUser?.id ?? "admin",
        moderated_at: new Date().toISOString(),
        moderation_note: payload.moderationNote?.trim() || null
      } as never)
      .eq("id", reviewId)
      .select(
        "id, product_id, order_id, order_number, customer_name, customer_phone, rating, comment, photo_url, status, moderated_by, moderated_at, moderation_note, created_at, updated_at"
      )
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json({ error: "Review not found." }, { status: 404 });
    }

    revalidateReviews();

    return NextResponse.json({
      review: data
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid moderation payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to moderate review.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

