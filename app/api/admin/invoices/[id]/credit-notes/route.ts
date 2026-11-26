import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getInvoiceDetailBundle } from "@/lib/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid invoice ID.")
});

const creditNoteSchema = z.object({
  reason: z.string().trim().min(3, "Provide a reason for this credit note.").max(300),
  amount: z.coerce.number().positive("Credit amount must be greater than zero."),
  lines: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        sku: z.string().trim().optional().nullable(),
        qty: z.number().int().positive(),
        unit_price: z.number().min(0),
        line_total: z.number().min(0)
      })
    )
    .optional()
    .default([])
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = creditNoteSchema.parse(await request.json());

    const existing = await getInvoiceDetailBundle(id);
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const supabase = createAdminSupabaseClient();

    const { data, error } = await supabase
      .rpc("issue_credit_note" as never, {
        p_invoice_id: existing.invoice.id,
        p_reason: payload.reason,
        p_lines: payload.lines,
        p_amount: payload.amount,
        p_created_by: actor
      } as never)
      .single();

    if (error || !data) {
      const msg = error?.message ?? "Unable to issue credit note.";
      if (msg.includes("already fully credited")) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      throw new Error(msg);
    }

    const updated = await getInvoiceDetailBundle(existing.invoice.id);
    return NextResponse.json(
      { ok: true, creditNote: data, ...(updated ?? {}) },
      { status: 201 }
    );
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid credit note payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to issue credit note.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

