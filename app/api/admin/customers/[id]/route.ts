import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { normalizeCustomerTags } from "@/lib/customers";
import { getCustomerDetailBundle } from "@/lib/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Customer } from "@/lib/types";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid customer ID.")
});

const customerUpdateSchema = z
  .object({
    notes: z.string().trim().max(2000).nullable().optional(),
    tags: z.array(z.string().trim().max(32)).max(20).optional(),
    isFlagged: z.boolean().optional(),
    isBlocked: z.boolean().optional(),
    marketingOptIn: z.boolean().optional()
  })
  .strict();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const bundle = await getCustomerDetailBundle(id);
    if (!bundle) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    return NextResponse.json(bundle);
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid customer ID."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load customer.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = customerUpdateSchema.parse(await request.json());

    const existing = await getCustomerDetailBundle(id);
    if (!existing) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    if (existing.customer.anonymized_at) {
      return NextResponse.json(
        { error: "Anonymized customer records cannot be modified." },
        { status: 409 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (payload.notes !== undefined) {
      updates.notes = payload.notes || null;
    }
    if (payload.tags !== undefined) {
      updates.tags = normalizeCustomerTags(payload.tags);
    }
    if (payload.isFlagged !== undefined) {
      updates.is_flagged = payload.isFlagged;
    }
    if (payload.isBlocked !== undefined) {
      updates.is_blocked = payload.isBlocked;
    }
    if (payload.marketingOptIn !== undefined) {
      updates.marketing_opt_in = payload.marketingOptIn;
      updates.marketing_opt_in_at = payload.marketingOptIn
        ? existing.customer.marketing_opt_in_at ?? new Date().toISOString()
        : null;
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("customers")
      .update(updates as never)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to update customer.");
    }

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: adminUser?.email ?? "admin",
        role: adminUser?.adminRole ?? "owner"
      },
      action: "customer.updated",
      entity: "customer",
      entityId: id,
      before: {
        is_flagged: existing.customer.is_flagged,
        is_blocked: existing.customer.is_blocked,
        marketing_opt_in: existing.customer.marketing_opt_in,
        tags: existing.customer.tags
      },
      after: updates
    });

    return NextResponse.json({ ok: true, customer: data as Customer });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid customer update."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update customer.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

