import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest, getAuthErrorStatus } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createAdminUserSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  fullName: z.string().trim().min(2, "Enter the team member's name.").max(120),
  role: z.enum(["owner", "staff"]),
  password: z
    .string()
    .min(10, "Temporary password must be at least 10 characters.")
    .max(128)
});

export async function GET() {
  try {
    await assertAdminRequest({ requiredRole: "owner" });
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id, email, full_name, role, active, created_by, created_at, updated_at")
      .order("role", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ users: data ?? [] });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to load admin users.";
    return NextResponse.json(
      { error: message },
      { status: getAuthErrorStatus(message) }
    );
  }
}

export async function POST(request: Request) {
  try {
    const ownerUser = await assertAdminRequest({ requiredRole: "owner" });
    const payload = createAdminUserSchema.parse(await request.json());
    const normalizedEmail = payload.email.toLowerCase();
    const supabase = createAdminSupabaseClient();

    const { data: createdAuth, error: authError } =
      await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: payload.password,
        email_confirm: true,
        app_metadata: { role: payload.role },
        user_metadata: { full_name: payload.fullName }
      });

    if (authError || !createdAuth.user) {
      const msg = authError?.message ?? "Unable to create team account.";
      const status = msg.toLowerCase().includes("already") ? 409 : 400;
      return NextResponse.json({ error: msg }, { status });
    }

    const { data: record, error: dbError } = await supabase
      .from("admin_users")
      .upsert(
        {
          user_id: createdAuth.user.id,
          email: normalizedEmail,
          full_name: payload.fullName,
          role: payload.role,
          active: true,
          created_by: ownerUser.email ?? ownerUser.id
        } as never,
        { onConflict: "user_id" }
      )
      .select("user_id, email, full_name, role, active, created_by, created_at, updated_at")
      .single();

    if (dbError || !record) {
      throw new Error(dbError?.message ?? "Unable to save team member role.");
    }

    await recordAuditLog({
      actor: {
        id: ownerUser.id,
        email: ownerUser.email ?? ownerUser.id,
        role: "owner"
      },
      action: "role.assigned",
      entity: "admin_user",
      entityId: createdAuth.user.id,
      after: {
        email: normalizedEmail,
        full_name: payload.fullName,
        role: payload.role,
        active: true
      }
    });

    return NextResponse.json({ user: record }, { status: 201 });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid team member details."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to create team account.";
    return NextResponse.json(
      { error: message },
      { status: getAuthErrorStatus(message) }
    );
  }
}

