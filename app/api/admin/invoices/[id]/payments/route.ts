import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { getInvoiceDetailBundle } from "@/lib/data";
import { isValidMpesaCode, normalizeMpesaCode } from "@/lib/invoices";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid invoice ID.")
});

const recordPaymentSchema = z
  .object({
    amount: z.coerce.number().positive("Payment amount must be greater than zero."),
    method: z.enum(["cash", "mpesa"]),
    mpesaCode: z.string().trim().max(20).optional().nullable(),
    receivedBy: z.string().trim().min(2, "Specify who received payment (rider or admin).").max(120),
    paidAt: z.string().datetime().optional().nullable(),
    note: z.string().trim().max(300).optional().nullable()
  })
  .superRefine((data, ctx) => {
    if (data.method === "mpesa") {
      if (!data.mpesaCode || !data.mpesaCode.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mpesaCode"],
          message: "M-Pesa confirmation code is required."
        });
      } else if (!isValidMpesaCode(data.mpesaCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mpesaCode"],
          message: "Invalid M-Pesa code format (expected 10–12 letters/digits, e.g. SHK4P9X2M1)."
        });
      }
    }
  });

interface RecordPaymentRpcResult {
  payment_id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_status: string;
  amount_paid: string | number;
  balance_due: string | number;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = recordPaymentSchema.parse(await request.json());

    const existing = await getInvoiceDetailBundle(id);
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const supabase = createAdminSupabaseClient();

    const { data, error } = (await supabase
      .rpc("record_invoice_payment" as never, {
        p_invoice_id: existing.invoice.id,
        p_amount: payload.amount,
        p_method: payload.method,
        p_mpesa_code:
          payload.method === "mpesa" && payload.mpesaCode
            ? normalizeMpesaCode(payload.mpesaCode)
            : null,
        p_received_by: payload.receivedBy,
        p_paid_at: payload.paidAt ?? null,
        p_note: payload.note ?? null,
        p_created_by: actor
      } as never)
      .single()) as {
      data: RecordPaymentRpcResult | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      const msg = error?.message ?? "Unable to record payment.";
      if (msg.includes("not found")) {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      if (
        msg.includes("already been recorded") ||
        msg.includes("exceeds remaining balance") ||
        msg.includes("already fully paid") ||
        msg.includes("void invoice")
      ) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      throw new Error(msg);
    }

    const updated = await getInvoiceDetailBundle(existing.invoice.id);

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: actor,
        role: adminUser?.adminRole ?? "owner"
      },
      action: "payment.recorded",
      entity: "payment",
      entityId: data.payment_id,
      before: {
        invoiceId: existing.invoice.id,
        status: existing.invoice.status,
        amountPaid: existing.invoice.amount_paid
      },
      after: {
        invoiceId: existing.invoice.id,
        invoiceNumber: data.invoice_number,
        amount: payload.amount,
        method: payload.method,
        receivedBy: payload.receivedBy,
        invoiceStatus: data.invoice_status,
        amountPaid: Number(data.amount_paid)
      }
    });

    return NextResponse.json(
      {
        ok: true,
        paymentId: data.payment_id,
        invoiceStatus: data.invoice_status,
        amountPaid: Number(data.amount_paid),
        balanceDue: Number(data.balance_due),
        ...(updated ?? {})
      },
      { status: 201 }
    );
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid payment details."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to record payment.";
    const status =
      message === "UNAUTHORIZED" || message === "SESSION_EXPIRED"
        ? 401
        : message === "FORBIDDEN" || message === "MFA_REQUIRED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
