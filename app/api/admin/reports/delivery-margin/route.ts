import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getDeliveryMarginReportData } from "@/lib/data";
import { toNairobiDateIso } from "@/lib/invoices";
import { buildDeliveryMarginCsv } from "@/lib/riders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format.")
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format.")
      .optional(),
    format: z.enum(["json", "csv"]).optional()
  })
  .refine(value => !value.from || !value.to || value.from <= value.to, {
    message: "Start date must be on or before end date.",
    path: ["to"]
  });

export async function GET(request: Request) {
  try {
    await assertAdminRequest();
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      format: (searchParams.get("format") as "json" | "csv" | null) ?? undefined
    });

    const todayIso = toNairobiDateIso(new Date());
    const fromIso = parsed.from ?? `${todayIso.slice(0, 7)}-01`;
    const toIso = parsed.to ?? todayIso;

    const report = await getDeliveryMarginReportData(fromIso, toIso);

    if (parsed.format === "csv") {
      const csv = buildDeliveryMarginCsv(report);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="auro-ardon-delivery-margin-${fromIso}-to-${toIso}.csv"`,
          "Cache-Control": "no-store"
        }
      });
    }

    return NextResponse.json({ report });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid date range."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load delivery margin report.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

