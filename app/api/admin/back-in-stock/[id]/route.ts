import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idSchema = z.object({
  id: z.string().uuid("Invalid alert ID.")
});

const patchSchema = z.object({
  status: z.enum(["notified", "cancelled", "waiting"])
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idSchema.parse(await context.params);
    const payload = patchSchema.parse(await request.json());

    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const supabase = createAdminSupabaseClient();

    const updates: Record<string, unknown> = {
      status: payload.status,
      notified_at: payload.status === "notified" ? new Date().toISOString() : null,
      notified_by: payload.status === "notified" ? actor : null
    };

    const { data, error } = await supabase
      .from("back_in_stock_alerts")
      .update(updates as never)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Alert not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, alert: data });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid alert update."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update alert.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

