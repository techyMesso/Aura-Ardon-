import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { getOrderDetailBundle } from "@/lib/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid order ID.")
});

const toggleTestSchema = z.object({
  isTest: z.boolean()
});

function resolveErrorStatus(message: string, fallback = 400): number {
  if (message === "UNAUTHORIZED" || message === "SESSION_EXPIRED") return 401;
  if (message === "FORBIDDEN" || message === "MFA_REQUIRED") return 403;
  if (/not found/i.test(message)) return 404;
  if (/only pending orders/i.test(message)) return 409;
  return fallback;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest({ requiredRole: "owner" });
    const { id } = idParamSchema.parse(await context.params);
    const payload = toggleTestSchema.parse(await request.json());

    const supabase = createAdminSupabaseClient();
    const { data: existing, error: fetchError } = await supabase
      .from("orders")
      .select("id, order_number, status, is_test, customer_name")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const before = existing as {
      id: string;
      order_number: string | null;
      status: string | null;
      is_test: boolean;
      customer_name: string;
    };

    if ((before.status ?? "pending") !== "pending") {
      return NextResponse.json(
        { error: "Only pending orders can be marked or unmarked as test orders." },
        { status: 409 }
      );
    }

    const { error: rpcError } = await supabase
      .rpc("set_order_is_test" as never, {
        p_order_id: id,
        p_is_test: payload.isTest
      } as never)
      .single();

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message },
        { status: resolveErrorStatus(rpcError.message, 400) }
      );
    }

    await recordAuditLog({
      actor: {
        id: adminUser.id,
        email: adminUser.email ?? "owner",
        role: "owner"
      },
      action: payload.isTest ? "order.marked_as_test" : "order.unmarked_as_test",
      entity: "order",
      entityId: id,
      before: {
        order_number: before.order_number,
        is_test: Boolean(before.is_test)
      },
      after: {
        order_number: before.order_number,
        is_test: payload.isTest
      }
    });

    const bundle = await getOrderDetailBundle(id);
    if (!bundle) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json(bundle);
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid test-order request."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update test-order flag.";
    return NextResponse.json(
      { error: message },
      { status: resolveErrorStatus(message, 400) }
    );
  }
}

