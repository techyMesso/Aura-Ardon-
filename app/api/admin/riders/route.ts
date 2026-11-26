import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { listRiders } from "@/lib/data";
import { sanitizeZoneCosts } from "@/lib/riders";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Rider } from "@/lib/types";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createRiderSchema = z.object({
  name: z.string().trim().min(2, "Rider name must be at least 2 characters.").max(120),
  phone: z.string().trim().min(9, "Enter a valid Kenyan phone number.").max(32),
  active: z.boolean().optional().default(true),
  defaultCost: z.coerce
    .number()
    .min(0, "Default cost cannot be negative.")
    .max(1_000_000)
    .default(0),
  zoneCosts: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
  notes: z.string().trim().max(500).optional().nullable()
});

function formatRiderRow(row: Record<string, unknown>): Rider {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    active: Boolean(row.active ?? true),
    default_cost: Number(row.default_cost ?? 0),
    zone_costs: sanitizeZoneCosts(row.zone_costs),
    notes: typeof row.notes === "string" && row.notes.trim() ? row.notes : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? "")
  };
}

export async function GET(request: Request) {
  try {
    await assertAdminRequest();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const riders = await listRiders({ activeOnly });
    return NextResponse.json({ riders });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to load riders.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    await assertAdminRequest();
    const payload = createRiderSchema.parse(await request.json());

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeKenyanPhoneNumber(payload.phone);
    } catch {
      return NextResponse.json(
        { error: "Enter a valid Kenyan mobile number (e.g. 0712 345 678 or 254712345678)." },
        { status: 400 }
      );
    }

    const zoneCosts = sanitizeZoneCosts(payload.zoneCosts ?? {});
    const supabase = createAdminSupabaseClient();

    const { data, error } = await supabase
      .from("riders")
      .insert({
        name: payload.name,
        phone: normalizedPhone,
        active: payload.active,
        default_cost: Math.round(payload.defaultCost * 100) / 100,
        zone_costs: zoneCosts,
        notes: payload.notes?.trim() || null
      } as never)
      .select("id, name, phone, active, default_cost, zone_costs, notes, created_at, updated_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to create rider.");
    }

    return NextResponse.json(
      { rider: formatRiderRow(data as unknown as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid rider payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to create rider.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

