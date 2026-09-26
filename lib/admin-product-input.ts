import { z } from "zod";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const productFields = {
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(12),
  price: z.coerce.number().positive("Price must be above zero."),
  stock_quantity: z.coerce.number().int().min(0, "Stock quantity cannot be negative."),
  category_id: z.string().uuid("Select a valid category."),
  material: z.string().trim().min(1, "Material is required.").max(80),
  images: z.array(z.string().url()).min(1, "Add at least one image.").max(10),
  active: z.boolean().optional(),
  is_featured: z.boolean().optional()
};

export const productCreateSchema = z.object(productFields);
export const productUpdateSchema = z.object(productFields).partial();

export async function getSelectedProductCategory(categoryId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("The selected category no longer exists. Choose another category.");

  return data as { id: string; name: string };
}
