import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const orderUpdateSchema = z.object({
  status: z.enum(["new", "confirmed", "delivered", "cancelled"])
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = await context.params;
    const payload = orderUpdateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("orders")
      .update({ order_status: payload.status } as never)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ order: data });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to update order.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
