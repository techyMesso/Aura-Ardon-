import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clearEventsSchema = z.object({
  beforeDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
});

function resolveAuthStatus(message: string, fallback = 400): number {
  if (message === "UNAUTHORIZED" || message === "SESSION_EXPIRED") return 401;
  if (message === "FORBIDDEN" || message === "MFA_REQUIRED") return 403;
  return fallback;
}

export async function POST(request: Request) {
  try {
    const adminUser = await assertAdminRequest({ requiredRole: "owner" });
    const parsed = clearEventsSchema.parse(await request.json());

    // Interpret cutoff date as 00:00:00 Africa/Nairobi (UTC+03:00)
    const cutoffIso = `${parsed.beforeDate}T00:00:00.000+03:00`;
    if (Number.isNaN(Date.parse(cutoffIso))) {
      return NextResponse.json({ error: "Invalid cutoff date." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { count, error } = await supabase
      .from("events")
      .delete({ count: "exact" })
      .lt("created_at", cutoffIso);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const deletedCount = count ?? 0;

    await recordAuditLog({
      actor: {
        id: adminUser.id,
        email: adminUser.email ?? "owner",
        role: "owner"
      },
      action: "events.cleared_before_date",
      entity: "analytics_events",
      before: { beforeDate: parsed.beforeDate, cutoffIso },
      after: { deletedCount }
    });

    return NextResponse.json({
      ok: true,
      beforeDate: parsed.beforeDate,
      deletedCount
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid clear-events request."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to clear storefront events.";
    return NextResponse.json(
      { error: message },
      { status: resolveAuthStatus(message, 400) }
    );
  }
}

