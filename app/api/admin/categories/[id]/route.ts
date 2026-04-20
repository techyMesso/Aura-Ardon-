import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const categoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  image_url: z.string().optional(),
  parent_id: z.string().optional(),
  display_order: z.number().optional()
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 404 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = await context.params;
    const payload = categoryUpdateSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

     const updates: Record<string, any> = {};
     if (payload.name !== undefined) updates.name = payload.name;
     if (payload.slug !== undefined) updates.slug = payload.slug;
     if (payload.description !== undefined) updates.description = payload.description;
     if (payload.image_url !== undefined) updates.image_url = payload.image_url;
     if (payload.parent_id !== undefined) updates.parent_id = payload.parent_id || null;
     if (payload.display_order !== undefined) updates.display_order = payload.display_order;

    const { data, error } = await supabase
      .from("categories")
      .update(updates as never)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase.from("categories").delete().eq("id", id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
