import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDailySummaryReportData } from "@/lib/data";
import { toNairobiDateIso } from "@/lib/invoices";
import { logger } from "@/lib/logger";
import { sendDailySummaryNotifications } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
    .optional()
});

function isAuthorizedCronRequest(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) {
    return false;
  }

  const provided = authHeader.slice(prefix.length).trim();
  const expectedBuffer = Buffer.from(configuredSecret, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function runDailySummary(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const { date } = querySchema.parse({
      date: searchParams.get("date") ?? undefined
    });
    const targetDate = date ?? toNairobiDateIso(new Date());

    const summary = await getDailySummaryReportData(targetDate);
    const delivery = await sendDailySummaryNotifications(summary);

    logger.info("20:00 EAT daily summary cron completed", {
      date: targetDate,
      ordersToday: summary.ordersTodayCount,
      bookedRevenue: summary.bookedRevenue,
      collectedRevenue: summary.collectedRevenue,
      pendingOrders: summary.pendingOrdersCount,
      lowStockCount: summary.lowStockCount,
      cashStillToCollectTotal: summary.cashStillToCollectTotal,
      emailSent: delivery.email.sent,
      pushSent: delivery.push.sent,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({
      ok: true,
      summary,
      delivery
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid date parameter."
        : caughtError instanceof Error
          ? caughtError.message
          : "Daily summary cron failed.";
    logger.error("20:00 EAT daily summary cron failed", {
      error: message,
      durationMs: Date.now() - startedAt
    });
    const status = caughtError instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: Request) {
  return runDailySummary(request);
}

export async function POST(request: Request) {
  return runDailySummary(request);
}

