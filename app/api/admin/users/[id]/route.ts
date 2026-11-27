import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest, getAuthErrorStatus } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid user ID.")
});

const updateUserSchema = z
  .object({
    role: z.enum(["owner", "staff"]).optional(),
    active: z.boolean().optional(),
    fullName: z.string().trim().min(2).max(120).optional()
  })
  .refine(
    data =>
      data.role !== undefined ||
      data.active !== undefined ||
      data.fullName !== undefined,
    { message: "Provide a role, status, or name to update." }
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ownerUser = await assertAdminRequest({ requiredRole: "owner" });
    const { id } = idParamSchema.parse(await context.params);
    const payload = updateUserSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const { data: existing, error: fetchError } = await supabase
      .from("admin_users")
      .select("user_id, email, full_name, role, active")
      .eq("user_id", id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Team account not found." }, { status: 404 });
    }

    const beforeRow = existing as {
      user_id: string;
      email: string;
      full_name: string | null;
      role: "owner" | "staff";
      active: boolean;
    };

    if (
      id === ownerUser.id &&
      (payload.active === false || payload.role === "staff")
    ) {
      return NextResponse.json(
        { error: "You cannot deactivate or demote your own active owner account." },
        { status: 409 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (payload.role !== undefined) updates.role = payload.role;
    if (payload.active !== undefined) updates.active = payload.active;
    if (payload.fullName !== undefined) updates.full_name = payload.fullName;

    const nextRole = payload.role ?? beforeRow.role;
    const nextActive = payload.active ?? beforeRow.active;

    await supabase.auth.admin.updateUserById(id, {
      app_metadata: { role: nextActive ? nextRole : null }
    });

    const { data: updated, error: updateError } = await supabase
      .from("admin_users")
      .update(updates as never)
      .eq("user_id", id)
      .select("user_id, email, full_name, role, active, created_by, created_at, updated_at")
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Unable to update team account.");
    }

    await recordAuditLog({
      actor: {
        id: ownerUser.id,
        email: ownerUser.email ?? ownerUser.id,
        role: "owner"
      },
      action: "role.updated",
      entity: "admin_user",
      entityId: id,
      before: beforeRow,
      after: {
        email: beforeRow.email,
        full_name: payload.fullName ?? beforeRow.full_name,
        role: nextRole,
        active: nextActive
      }
    });

    return NextResponse.json({ user: updated });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid user update."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update team account.";
    return NextResponse.json(
      { error: message },
      { status: getAuthErrorStatus(message) }
    );
  }
}

