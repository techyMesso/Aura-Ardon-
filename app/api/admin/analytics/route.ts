import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveAnalyticsDateRange } from "@/lib/analytics";
import { assertAdminRequest, isOwnerUser } from "@/lib/auth";
import { getAnalyticsDashboardData } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  preset: z
    .enum(["today", "7d", "30d", "90d", "this_month", "custom"])
    .optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD.")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD.")
    .optional()
});

export async function GET(request: Request) {
  try {
    const adminUser = await assertAdminRequest();
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      preset: searchParams.get("preset") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined
    });

    const resolved = resolveAnalyticsDateRange(
      parsed.preset ?? (parsed.from || parsed.to ? "custom" : "30d"),
      parsed.from,
      parsed.to
    );

    const includeOwnerMetrics = isOwnerUser(adminUser);
    const report = await getAnalyticsDashboardData({
      from: resolved.from,
      to: resolved.to,
      includeOwnerMetrics
    });

    return NextResponse.json({
      preset: resolved.preset,
      report
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid analytics query parameters."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load analytics.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
