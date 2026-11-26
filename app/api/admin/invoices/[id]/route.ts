import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getInvoiceDetailBundle } from "@/lib/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid invoice ID.")
});

// Only non-financial metadata (manual eTIMS ref & share link revocation) may be updated.
const invoiceMetaUpdateSchema = z
  .object({
    etimsInvoiceNumber: z.string().trim().max(80).nullable().optional(),
    shareRevoked: z.boolean().optional()
  })
  .strict()
  .refine(
    payload =>
      payload.etimsInvoiceNumber !== undefined || payload.shareRevoked !== undefined,
    { message: "Provide eTIMS reference or shareRevoked to update." }
  );

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const bundle = await getInvoiceDetailBundle(id);
    if (!bundle) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    return NextResponse.json(bundle);
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid invoice ID."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load invoice.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = invoiceMetaUpdateSchema.parse(await request.json());

    const existing = await getInvoiceDetailBundle(id);
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (payload.etimsInvoiceNumber !== undefined) {
      updates.etims_invoice_number = payload.etimsInvoiceNumber || null;
      // Clear cached PDFs so regenerated PDF reflects updated manual reference
      updates.pdf_a4_path = null;
      updates.pdf_receipt_path = null;
    }
    if (payload.shareRevoked !== undefined) {
      updates.share_revoked = payload.shareRevoked;
    }

    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from("invoices")
      .update(updates as never)
      .eq("id", existing.invoice.id);

    if (error) {
      throw new Error(error.message);
    }

    const updated = await getInvoiceDetailBundle(existing.invoice.id);
    return NextResponse.json({ ok: true, ...(updated ?? {}) });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ??
          "Issued invoices are immutable. Only eTIMS reference or share link revocation can be changed."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update invoice.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Issued invoices cannot be deleted. Issue a credit note instead." },
    { status: 405 }
  );
}

