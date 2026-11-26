import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyDeliveredOrderForReview } from "@/lib/data";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifySchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(3, "Enter your order number (e.g. AA-7F3K2).")
    .max(32),
  phone: z
    .string()
    .trim()
    .min(9, "Enter the Kenyan phone number used on your order.")
    .max(30)
});

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const ipLimit = await checkRateLimit({
    key: `reviews-verify:ip:${ip}`,
    limit: 10,
    windowMs: 10 * 60 * 1000
  });

  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Too many verification attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": `${ipLimit.retryAfterSeconds}` } }
    );
  }

  try {
    const payload = verifySchema.parse(await request.json());
    const normalizedPhone = normalizeKenyanPhoneNumber(payload.phone);
    const verification = await verifyDeliveredOrderForReview(
      payload.orderNumber,
      normalizedPhone
    );

    if (!verification.ok) {
      return NextResponse.json(
        { error: verification.message },
        { status: verification.reason === "not_delivered" ? 409 : 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      orderNumber: verification.orderNumber,
      reviewerDisplayName: verification.reviewerDisplayName,
      items: verification.items
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Please check your order number and phone."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to verify your order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

