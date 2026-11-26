import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getMonthlySummaryReportData, getStoreSettings } from "@/lib/data";
import { buildMonthlySummaryCsv, toNairobiMonthIso } from "@/lib/invoices";
import { renderMonthlySummaryPdfBuffer } from "@/lib/pdf/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format.")
    .optional(),
  format: z.enum(["json", "csv", "pdf"]).optional().default("json")
});

export async function GET(request: Request) {
  try {
    await assertAdminRequest();
    const { searchParams } = new URL(request.url);
    const { month, format } = querySchema.parse({
      month: searchParams.get("month") ?? undefined,
      format: searchParams.get("format") ?? "json"
    });

    const targetMonth = month ?? toNairobiMonthIso(new Date());
    const { report, invoices, payments, creditNotes } =
      await getMonthlySummaryReportData(targetMonth);

    if (format === "csv") {
      const csv = buildMonthlySummaryCsv(report, invoices, payments, creditNotes);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="auro-ardon-monthly-summary-${targetMonth}.csv"`,
          "Cache-Control": "private, no-store"
        }
      });
    }

    if (format === "pdf") {
      const settings = await getStoreSettings();
      const pdfBuffer = await renderMonthlySummaryPdfBuffer(report, settings);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="auro-ardon-monthly-summary-${targetMonth}.pdf"`,
          "Cache-Control": "private, no-store"
        }
      });
    }

    return NextResponse.json({ report });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid report parameters."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to generate monthly summary.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

