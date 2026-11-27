import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { discountCodePayloadSchema } from "@/lib/discounts";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { DiscountCode } from "@/lib/types";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid discount ID.")
});

const toggleOnlySchema = z.object({
  active: z.boolean()
}).strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest({ requiredRole: "owner" });
    const { id } = idParamSchema.parse(await context.params);
    const body = (await request.json()) as unknown;
    const supabase = createAdminSupabaseClient();

    // Support quick active toggle or full payload update
    const toggleCheck = toggleOnlySchema.safeParse(body);
    let updates: Record<string, unknown>;

    if (toggleCheck.success) {
      updates = { active: toggleCheck.data.active };
    } else {
      const payload = discountCodePayloadSchema.parse(body);
      updates = {
        code: payload.code,
        description: payload.description,
        type: payload.type,
        value:
          payload.type === "free_delivery"
            ? "0.00"
            : toMoneyString(payload.value),
        min_order_amount: toMoneyString(payload.min_order_amount),
        starts_at: payload.starts_at,
        ends_at: payload.ends_at,
        usage_limit: payload.usage_limit,
        per_phone_limit: payload.per_phone_limit,
        first_order_only: payload.first_order_only,
        active: payload.active
      };
    }

    const { data, error } = await supabase
      .from("discount_codes")
      .update(updates as never)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { error: "Another discount code with that name already exists." },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: adminUser?.email ?? "owner",
        role: "owner"
      },
      action: "discount.updated",
      entity: "discount_code",
      entityId: id,
      after: data
    });

    return NextResponse.json({ discount: data as DiscountCode });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid discount update."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update discount code.";
    const status =
      message === "UNAUTHORIZED" || message === "SESSION_EXPIRED"
        ? 401
        : message === "FORBIDDEN" || message === "MFA_REQUIRED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest({ requiredRole: "owner" });
    const { id } = idParamSchema.parse(await context.params);
    const supabase = createAdminSupabaseClient();

    const { error } = await supabase
      .from("discount_codes")
      .delete()
      .eq("id", id);

    if (error) {
      if (error.code === "23503") {
        // Code has historical redemptions — deactivate instead of breaking order history
        await supabase
          .from("discount_codes")
          .update({ active: false } as never)
          .eq("id", id);

        await recordAuditLog({
          actor: {
            id: adminUser?.id ?? null,
            email: adminUser?.email ?? "owner",
            role: "owner"
          },
          action: "discount.deactivated",
          entity: "discount_code",
          entityId: id,
          after: { active: false }
        });

        return NextResponse.json({
          ok: true,
          deactivated: true,
          message:
            "This discount code has past redemptions, so it was deactivated instead of deleted to preserve order history."
        });
      }
      throw new Error(error.message);
    }

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: adminUser?.email ?? "owner",
        role: "owner"
      },
      action: "discount.deleted",
      entity: "discount_code",
      entityId: id
    });

    return NextResponse.json({ ok: true, deactivated: false });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid discount ID."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to delete discount code.";
    const status =
      message === "UNAUTHORIZED" || message === "SESSION_EXPIRED"
        ? 401
        : message === "FORBIDDEN" || message === "MFA_REQUIRED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

