import { NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { revalidateDeliveryZones } from "@/lib/cache";
import {
  isValidUuid,
  normalizeDeliveryZoneName,
  updateDeliveryZoneSchema
} from "@/lib/delivery-zones";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { DeliveryZone } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveErrorStatus(message: string, fallback = 400): number {
  if (message === "UNAUTHORIZED" || message === "SESSION_EXPIRED") return 401;
  if (message === "FORBIDDEN" || message === "MFA_REQUIRED") return 403;
  return fallback;
}

function toDeliveryZone(row: Record<string, unknown>): DeliveryZone {
  return {
    id: String(row.id),
    name: String(row.name),
    fee: Number(row.fee ?? 0),
    active: Boolean(row.active),
    sort_order: Number(row.sort_order ?? 0),
    is_outside_nairobi: Boolean(row.is_outside_nairobi),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? "")
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest({ requiredRole: "owner" });

    const { id } = await context.params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: "Invalid delivery zone ID." }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updateDeliveryZoneSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid delivery zone update."
        },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();

    const { data: existingRow, error: fetchError } = await supabase
      .from("delivery_zones")
      .select("id, name, fee, active, sort_order, is_outside_nairobi, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existingRow) {
      return NextResponse.json({ error: "Delivery zone not found." }, { status: 404 });
    }

    const beforeZone = toDeliveryZone(existingRow as Record<string, unknown>);

    if (parsed.data.name !== undefined) {
      const normalizedNext = normalizeDeliveryZoneName(parsed.data.name);
      const { data: otherZones, error: othersError } = await supabase
        .from("delivery_zones")
        .select("id, name")
        .neq("id", id);

      if (othersError) {
        return NextResponse.json({ error: othersError.message }, { status: 500 });
      }

      const duplicate = ((otherZones ?? []) as Array<{ id: string; name: string }>).some(
        zone => normalizeDeliveryZoneName(zone.name) === normalizedNext
      );
      if (duplicate) {
        return NextResponse.json(
          {
            error: `A delivery zone named "${parsed.data.name}" already exists.`
          },
          { status: 409 }
        );
      }
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.fee !== undefined) patch.fee = parsed.data.fee;
    if (parsed.data.active !== undefined) patch.active = parsed.data.active;
    if (parsed.data.is_outside_nairobi !== undefined) {
      patch.is_outside_nairobi = parsed.data.is_outside_nairobi;
    }
    if (parsed.data.sort_order !== undefined) patch.sort_order = parsed.data.sort_order;

    const { data: updatedRow, error: updateError } = await supabase
      .from("delivery_zones")
      .update(patch as never)
      .eq("id", id)
      .select("id, name, fee, active, sort_order, is_outside_nairobi, created_at, updated_at")
      .single();

    if (updateError || !updatedRow) {
      const status = updateError?.code === "23505" ? 409 : 400;
      return NextResponse.json(
        {
          error:
            updateError?.code === "23505"
              ? `A delivery zone named "${parsed.data.name}" already exists.`
              : updateError?.message ?? "Unable to update delivery zone."
        },
        { status }
      );
    }

    const afterZone = toDeliveryZone(updatedRow as Record<string, unknown>);

    const onlyActiveChanged =
      parsed.data.active !== undefined &&
      parsed.data.name === undefined &&
      parsed.data.fee === undefined &&
      parsed.data.is_outside_nairobi === undefined &&
      parsed.data.sort_order === undefined;

    const action = onlyActiveChanged
      ? afterZone.active
        ? "delivery_zone.reactivated"
        : "delivery_zone.deactivated"
      : "delivery_zone.updated";

    await recordAuditLog({
      actor: {
        id: adminUser.id,
        email: adminUser.email ?? "owner",
        role: "owner"
      },
      action,
      entity: "delivery_zone",
      entityId: afterZone.id,
      before: beforeZone,
      after: afterZone
    });

    revalidateDeliveryZones();

    const { count: orderCount } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("delivery_zone_id", id);

    return NextResponse.json({
      zone: {
        ...afterZone,
        order_count: orderCount ?? 0
      }
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to update delivery zone.";
    return NextResponse.json(
      { error: message },
      { status: resolveErrorStatus(message, 400) }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest({ requiredRole: "owner" });

    const { id } = await context.params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: "Invalid delivery zone ID." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    const { data: existingRow, error: fetchError } = await supabase
      .from("delivery_zones")
      .select("id, name, fee, active, sort_order, is_outside_nairobi, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existingRow) {
      return NextResponse.json({ error: "Delivery zone not found." }, { status: 404 });
    }

    const beforeZone = toDeliveryZone(existingRow as Record<string, unknown>);

    const { count: orderCount, error: countError } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("delivery_zone_id", id);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if ((orderCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Delivery zone "${beforeZone.name}" is referenced by ${orderCount} existing order(s) and cannot be deleted. Deactivate it instead.`,
          code: "ZONE_REFERENCED_BY_ORDERS",
          orderCount
        },
        { status: 409 }
      );
    }

    const { error: deleteError } = await supabase
      .from("delivery_zones")
      .delete()
      .eq("id", id);

    if (deleteError) {
      const isReferenced =
        deleteError.code === "23503" ||
        /referenced by existing orders/i.test(deleteError.message);
      return NextResponse.json(
        {
          error: isReferenced
            ? `Delivery zone "${beforeZone.name}" is referenced by existing orders and cannot be deleted. Deactivate it instead.`
            : deleteError.message,
          code: isReferenced ? "ZONE_REFERENCED_BY_ORDERS" : undefined
        },
        { status: isReferenced ? 409 : 400 }
      );
    }

    await recordAuditLog({
      actor: {
        id: adminUser.id,
        email: adminUser.email ?? "owner",
        role: "owner"
      },
      action: "delivery_zone.deleted",
      entity: "delivery_zone",
      entityId: beforeZone.id,
      before: beforeZone,
      after: null
    });

    revalidateDeliveryZones();

    return NextResponse.json({ ok: true, id: beforeZone.id });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to delete delivery zone.";
    return NextResponse.json(
      { error: message },
      { status: resolveErrorStatus(message, 500) }
    );
  }
}
