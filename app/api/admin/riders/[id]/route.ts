import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { sanitizeZoneCosts } from "@/lib/riders";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Rider } from "@/lib/types";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid rider ID.")
});

const updateRiderSchema = z
  .object({
    name: z.string().trim().min(2, "Rider name must be at least 2 characters.").max(120).optional(),
    phone: z.string().trim().min(9, "Enter a valid Kenyan phone number.").max(32).optional(),
    active: z.boolean().optional(),
    defaultCost: z.coerce
      .number()
      .min(0, "Default cost cannot be negative.")
      .max(1_000_000)
      .optional(),
    zoneCosts: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
    notes: z.string().trim().max(500).nullable().optional()
  })
  .refine(
    value =>
      value.name !== undefined ||
      value.phone !== undefined ||
      value.active !== undefined ||
      value.defaultCost !== undefined ||
      value.zoneCosts !== undefined ||
      value.notes !== undefined,
    { message: "Provide at least one field to update." }
  );

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = updateRiderSchema.parse(await request.json());

    const updates: Record<string, unknown> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.phone !== undefined) {
      try {
        updates.phone = normalizeKenyanPhoneNumber(payload.phone);
      } catch {
        return NextResponse.json(
          { error: "Enter a valid Kenyan mobile number (e.g. 0712 345 678 or 254712345678)." },
          { status: 400 }
        );
      }
    }
    if (payload.active !== undefined) updates.active = payload.active;
    if (payload.defaultCost !== undefined) {
      updates.default_cost = Math.round(payload.defaultCost * 100) / 100;
    }
    if (payload.zoneCosts !== undefined) {
      updates.zone_costs = sanitizeZoneCosts(payload.zoneCosts);
    }
    if (payload.notes !== undefined) {
      updates.notes = payload.notes?.trim() || null;
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("riders")
      .update(updates as never)
      .eq("id", id)
      .select("id, name, phone, active, default_cost, zone_costs, notes, created_at, updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      return NextResponse.json({ error: "Rider not found." }, { status: 404 });
    }

    return NextResponse.json({
      rider: formatRiderRow(data as unknown as Record<string, unknown>)
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid rider update."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update rider.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const supabase = createAdminSupabaseClient();

    const { count, error: countError } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("rider_id", id);

    if (countError) {
      throw new Error(countError.message);
    }

    if ((count ?? 0) > 0) {
      const { data: deactivated, error: deactivateError } = await supabase
        .from("riders")
        .update({ active: false } as never)
        .eq("id", id)
        .select("id, name, phone, active, default_cost, zone_costs, notes, created_at, updated_at")
        .maybeSingle();

      if (deactivateError) throw new Error(deactivateError.message);
      if (!deactivated) {
        return NextResponse.json({ error: "Rider not found." }, { status: 404 });
      }

      return NextResponse.json({
        archived: true,
        rider: formatRiderRow(deactivated as unknown as Record<string, unknown>),
        message: "Rider has past deliveries and was deactivated instead of deleted to preserve delivery history."
      });
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("riders")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (deleteError) throw new Error(deleteError.message);
    if (!deleted) {
      return NextResponse.json({ error: "Rider not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid rider ID."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to delete rider.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

