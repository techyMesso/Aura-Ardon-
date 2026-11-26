import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getDailyCashupReportData } from "@/lib/data";
import { toNairobiDateIso } from "@/lib/invoices";

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
    await assertAdminRequest();
    const { searchParams } = new URL(request.url);
    const { date } = querySchema.parse({
      date: searchParams.get("date") ?? undefined
    });
    const targetDate = date ?? toNairobiDateIso(new Date());
    const report = await getDailyCashupReportData(targetDate);

    return NextResponse.json({ report });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid date parameter."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load daily cash-up report.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

