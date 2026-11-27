import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { getOrderDetailBundle } from "@/lib/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid order ID.")
});

const assignRiderSchema = z.object({
  riderId: z.string().uuid("Invalid rider ID.").nullable().optional(),
  riderCost: z
    .number()
    .min(0, "Rider cost cannot be negative.")
    .max(1_000_000)
    .nullable()
    .optional()
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = assignRiderSchema.parse(await request.json());

    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const supabase = createAdminSupabaseClient();

    const { error } = await supabase
      .rpc("assign_order_rider" as never, {
        p_order_id: id,
        p_rider_id: payload.riderId ?? null,
        p_rider_cost: payload.riderCost ?? null,
        p_changed_by: actor
      } as never)
      .single();

    if (error) {
      if (
        error.message.includes("Order not found") ||
        error.message.includes("Rider not found")
      ) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (
        error.message.includes("cancelled") ||
        error.message.includes("inactive")
      ) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw new Error(error.message);
    }

    const detail = await getOrderDetailBundle(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: actor,
        role: adminUser?.adminRole ?? "owner"
      },
      action: "order.rider_assigned",
      entity: "order",
      entityId: id,
      after: {
        riderId: payload.riderId ?? null,
        riderCost: payload.riderCost ?? null
      }
    });

    return NextResponse.json({ ok: true, ...detail });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid rider assignment payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to assign rider.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

