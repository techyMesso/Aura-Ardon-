import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getDailySummaryReportData } from "@/lib/data";
import { toNairobiDateIso } from "@/lib/invoices";
import { sendDailySummaryNotifications } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
    .optional()
});

export async function GET(request: Request) {
  try {
    await assertAdminRequest({ requiredRole: "owner" });
    const { searchParams } = new URL(request.url);
    const { date } = querySchema.parse({
      date: searchParams.get("date") ?? undefined
    });
    const targetDate = date ?? toNairobiDateIso(new Date());
    const summary = await getDailySummaryReportData(targetDate);
    return NextResponse.json({ summary });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid date parameter."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load daily summary.";
    const status =
      message === "UNAUTHORIZED" || message === "SESSION_EXPIRED"
        ? 401
        : message === "FORBIDDEN" || message === "MFA_REQUIRED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    await assertAdminRequest({ requiredRole: "owner" });
    const body = (await request.json().catch(() => ({}))) as { date?: string };
    const { date } = querySchema.parse({ date: body.date });
    const targetDate = date ?? toNairobiDateIso(new Date());
    const summary = await getDailySummaryReportData(targetDate);
    const delivery = await sendDailySummaryNotifications(summary);
    return NextResponse.json({ ok: true, summary, delivery });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid date parameter."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to send daily summary.";
    const status =
      message === "UNAUTHORIZED" || message === "SESSION_EXPIRED"
        ? 401
        : message === "FORBIDDEN" || message === "MFA_REQUIRED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

