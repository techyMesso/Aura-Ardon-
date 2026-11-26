import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getInvoiceDetailBundle } from "@/lib/data";
import { getOrGenerateInvoicePdf } from "@/lib/pdf/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid invoice ID.")
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const { searchParams } = new URL(request.url);
    const layout = searchParams.get("layout") === "receipt" ? "receipt" : "a4";
    const download = searchParams.get("download") === "1";

    const bundle = await getInvoiceDetailBundle(id);
    if (!bundle) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const pdfBuffer = await getOrGenerateInvoicePdf(bundle, layout);
    const filename = `${bundle.invoice.invoice_number}${
      layout === "receipt" ? "-80mm" : ""
    }.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid invoice ID."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to render invoice PDF.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

