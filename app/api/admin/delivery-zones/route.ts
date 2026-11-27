import { NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { revalidateDeliveryZones } from "@/lib/cache";
import { listAdminDeliveryZonesWithCounts } from "@/lib/data";
import {
  createDeliveryZoneSchema,
  normalizeDeliveryZoneName
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

export async function GET() {
  try {
    await assertAdminRequest({ requiredRole: "owner" });
    const zones = await listAdminDeliveryZonesWithCounts();
    return NextResponse.json({ zones });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to load delivery zones.";
    return NextResponse.json(
      { error: message },
      { status: resolveErrorStatus(message, 500) }
    );
  }
}

export async function POST(request: Request) {
  try {
    const adminUser = await assertAdminRequest({ requiredRole: "owner" });
    const body = await request.json();
    const parsed = createDeliveryZoneSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid delivery zone details."
        },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: existingRows, error: listError } = await supabase
      .from("delivery_zones")
      .select("id, name, sort_order");

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const existing = (existingRows ?? []) as Array<{
      id: string;
      name: string;
      sort_order: number;
    }>;

    const normalizedNew = normalizeDeliveryZoneName(parsed.data.name);
    if (existing.some(zone => normalizeDeliveryZoneName(zone.name) === normalizedNew)) {
      return NextResponse.json(
        {
          error: `A delivery zone named "${parsed.data.name}" already exists.`
        },
        { status: 409 }
      );
    }

    const maxSort = existing.reduce(
      (max, zone) => Math.max(max, Number(zone.sort_order ?? 0)),
      0
    );
    const sortOrder = parsed.data.sort_order ?? maxSort + 1;

    const { data: inserted, error: insertError } = await supabase
      .from("delivery_zones")
      .insert({
        name: parsed.data.name,
        fee: parsed.data.fee,
        active: parsed.data.active,
        is_outside_nairobi: parsed.data.is_outside_nairobi,
        sort_order: sortOrder
      } as never)
      .select("id, name, fee, active, sort_order, is_outside_nairobi, created_at, updated_at")
      .single();

    if (insertError || !inserted) {
      const status = insertError?.code === "23505" ? 409 : 400;
      return NextResponse.json(
        {
          error:
            insertError?.code === "23505"
              ? `A delivery zone named "${parsed.data.name}" already exists.`
              : insertError?.message ?? "Unable to create delivery zone."
        },
        { status }
      );
    }

    const zone = toDeliveryZone(inserted as Record<string, unknown>);

    await recordAuditLog({
      actor: {
        id: adminUser.id,
        email: adminUser.email ?? "owner",
        role: "owner"
      },
      action: "delivery_zone.created",
      entity: "delivery_zone",
      entityId: zone.id,
      before: null,
      after: zone
    });

    revalidateDeliveryZones();

    return NextResponse.json(
      { zone: { ...zone, order_count: 0 } },
      { status: 201 }
    );
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to create delivery zone.";
    return NextResponse.json(
      { error: message },
      { status: resolveErrorStatus(message, 400) }
    );
  }
}
