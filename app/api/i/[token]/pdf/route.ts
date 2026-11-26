import { NextResponse } from "next/server";

import { getInvoiceByShareToken } from "@/lib/data";
import { getOrGenerateInvoicePdf } from "@/lib/pdf/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const bundle = await getInvoiceByShareToken(token);
    if (!bundle) {
      return NextResponse.json({ error: "Invoice link not found or expired." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const layout = searchParams.get("layout") === "receipt" ? "receipt" : "a4";
    const download = searchParams.get("download") !== "0";

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
  } catch {
    return NextResponse.json(
      { error: "Unable to render invoice PDF." },
      { status: 500 }
    );
  }
}

