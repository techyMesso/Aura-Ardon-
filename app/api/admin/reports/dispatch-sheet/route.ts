import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getDispatchSheetReportData } from "@/lib/data";
import { toNairobiDateIso } from "@/lib/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
    .optional(),
  riderId: z
    .union([
      z.literal("unassigned"),
      z.string().uuid("Invalid rider filter.")
    ])
    .optional(),
  includeConfirmed: z.enum(["true", "false"]).optional()
});

export async function GET(request: Request) {
  try {
    await assertAdminRequest();
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      date: searchParams.get("date") ?? undefined,
      riderId: searchParams.get("riderId") || undefined,
      includeConfirmed: searchParams.get("includeConfirmed") ?? undefined
    });

    const targetDate = parsed.date ?? toNairobiDateIso(new Date());
    const report = await getDispatchSheetReportData(targetDate, {
      riderId: parsed.riderId ?? null,
      includeConfirmed: parsed.includeConfirmed === "true"
    });

    return NextResponse.json({ report });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid dispatch sheet parameters."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load dispatch sheet.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

