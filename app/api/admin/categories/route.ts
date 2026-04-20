import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  image_url: z.string().optional(),
  parent_id: z.string().optional(),
  display_order: z.number()
});

export async function GET() {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await assertAdminRequest();
    const payload = categorySchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    const { data, error } = await supabase
      .from("categories")
      .insert({
        name: payload.name,
        slug: payload.slug || payload.name.toLowerCase().replace(/\s+/g, "-"),
        description: payload.description || null,
        image_url: payload.image_url || null,
        parent_id: payload.parent_id || null,
        display_order: payload.display_order
      } as never)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 }
    );
  }
}
