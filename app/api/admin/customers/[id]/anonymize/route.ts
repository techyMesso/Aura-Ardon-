import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getCustomerDetailBundle } from "@/lib/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid customer ID.")
});

const confirmSchema = z.object({
  confirm: z.literal("ANONYMIZE", {
    errorMap: () => ({ message: 'Type "ANONYMIZE" to confirm permanent data anonymisation.' })
  })
});

interface AnonymizeRpcResult {
  customer_id: string;
  anonymized_ref: string;
  orders_anonymized: number;
  invoices_anonymized: number;
  already_anonymized: boolean;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    confirmSchema.parse(await request.json());

    const actor = adminUser?.email ?? adminUser?.id ?? "owner";
    const supabase = createAdminSupabaseClient();

    const { data, error } = (await supabase
      .rpc("anonymize_customer" as never, {
        p_customer_id: id,
        p_actor: actor
      } as never)
      .single()) as {
      data: AnonymizeRpcResult | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      const msg = error?.message ?? "Unable to anonymize customer.";
      if (msg.includes("Customer not found")) {
        return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      }
      throw new Error(msg);
    }

    const updated = await getCustomerDetailBundle(id);

    return NextResponse.json({
      ok: true,
      anonymizedRef: data.anonymized_ref,
      ordersAnonymized: Number(data.orders_anonymized ?? 0),
      invoicesAnonymized: Number(data.invoices_anonymized ?? 0),
      alreadyAnonymized: Boolean(data.already_anonymized),
      ...(updated ?? {})
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Confirmation is required."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to anonymize customer.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

