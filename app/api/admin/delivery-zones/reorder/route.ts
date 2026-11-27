import { NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { revalidateDeliveryZones } from "@/lib/cache";
import { listAdminDeliveryZonesWithCounts } from "@/lib/data";
import { reorderDeliveryZonesSchema } from "@/lib/delivery-zones";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveErrorStatus(message: string, fallback = 400): number {
  if (message === "UNAUTHORIZED" || message === "SESSION_EXPIRED") return 401;
  if (message === "FORBIDDEN" || message === "MFA_REQUIRED") return 403;
  return fallback;
}

export async function POST(request: Request) {
  try {
    const adminUser = await assertAdminRequest({ requiredRole: "owner" });
    const body = await request.json();
    const parsed = reorderDeliveryZonesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid reorder payload."
        },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: existingRows, error: fetchError } = await supabase
      .from("delivery_zones")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const existing = (existingRows ?? []) as Array<{
      id: string;
      name: string;
      sort_order: number;
    }>;

    const existingById = new Map(existing.map(row => [row.id, row]));
    for (const zoneId of parsed.data.orderedIds) {
      if (!existingById.has(zoneId)) {
        return NextResponse.json(
          { error: `Unknown delivery zone ID in reorder payload: ${zoneId}` },
          { status: 400 }
        );
      }
    }

    const submittedSet = new Set(parsed.data.orderedIds);
    const fullOrderIds = [
      ...parsed.data.orderedIds,
      ...existing.filter(row => !submittedSet.has(row.id)).map(row => row.id)
    ];

    const beforeOrder = existing.map(row => ({
      id: row.id,
      name: row.name,
      sort_order: Number(row.sort_order ?? 0)
    }));

    const afterOrder: Array<{ id: string; name: string; sort_order: number }> = [];

    for (let index = 0; index < fullOrderIds.length; index += 1) {
      const zoneId = fullOrderIds[index];
      const nextSortOrder = index + 1;
      const current = existingById.get(zoneId)!;
      afterOrder.push({
        id: zoneId,
        name: current.name,
        sort_order: nextSortOrder
      });

      if (Number(current.sort_order ?? 0) !== nextSortOrder) {
        const { error: updateError } = await supabase
          .from("delivery_zones")
          .update({ sort_order: nextSortOrder } as never)
          .eq("id", zoneId);

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
      }
    }

    await recordAuditLog({
      actor: {
        id: adminUser.id,
        email: adminUser.email ?? "owner",
        role: "owner"
      },
      action: "delivery_zone.reordered",
      entity: "delivery_zone",
      before: beforeOrder,
      after: afterOrder
    });

    revalidateDeliveryZones();

    const zones = await listAdminDeliveryZonesWithCounts();
    return NextResponse.json({ zones });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to reorder delivery zones.";
    return NextResponse.json(
      { error: message },
      { status: resolveErrorStatus(message, 400) }
    );
  }
}
