import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { discountCodePayloadSchema } from "@/lib/discounts";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { DiscountCode } from "@/lib/types";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    await assertAdminRequest({ requiredRole: "owner" });
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("discount_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ discounts: (data ?? []) as DiscountCode[] });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to load discount codes.";
    const status =
      message === "UNAUTHORIZED" || message === "SESSION_EXPIRED"
        ? 401
        : message === "FORBIDDEN" || message === "MFA_REQUIRED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const adminUser = await assertAdminRequest({ requiredRole: "owner" });
    const payload = discountCodePayloadSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const { data, error } = await supabase
      .from("discount_codes")
      .insert({
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
      } as never)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { error: `A discount code "${payload.code}" already exists.` },
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
      action: "discount.created",
      entity: "discount_code",
      entityId: (data as DiscountCode).id,
      after: data
    });

    return NextResponse.json({ discount: data as DiscountCode }, { status: 201 });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid discount code details."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to create discount code.";
    const status =
      message === "UNAUTHORIZED" || message === "SESSION_EXPIRED"
        ? 401
        : message === "FORBIDDEN" || message === "MFA_REQUIRED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

