import { z } from "zod";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const nullableOptionalText = (maxLength: number) =>
  z.preprocess(
    value => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maxLength).nullable().optional()
  );

const nullableOptionalPositiveMoney = z.preprocess(
  value => (value === "" || value === undefined || value === null ? null : value),
  z.coerce.number().positive("Compare-at price must be above zero.").nullable().optional()
);

const productFields = {
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(12),
  price: z.coerce.number().positive("Price must be above zero."),
  compare_at_price: nullableOptionalPositiveMoney,
  stock_quantity: z.coerce.number().int().min(0, "Stock quantity cannot be negative."),
  category_id: z.string().uuid("Select a valid category."),
  material: z.string().trim().min(1, "Material is required.").max(80),
  finish: nullableOptionalText(160),
  size_label: nullableOptionalText(160),
  in_the_box: nullableOptionalText(240),
  care: nullableOptionalText(240),
  images: z.array(z.string().url()).min(1, "Add at least one image.").max(10),
  active: z.boolean().optional(),
  is_featured: z.boolean().optional()
};

export const productCreateSchema = z.object(productFields).superRefine((data, ctx) => {
  if (
    data.compare_at_price !== null &&
    data.compare_at_price !== undefined &&
    data.compare_at_price <= data.price
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["compare_at_price"],
      message: "Compare-at price must be higher than the selling price."
    });
  }
});

export const productUpdateSchema = z
  .object(productFields)
  .partial()
  .superRefine((data, ctx) => {
    if (
      data.compare_at_price !== null &&
      data.compare_at_price !== undefined &&
      data.price !== undefined &&
      data.compare_at_price <= data.price
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["compare_at_price"],
        message: "Compare-at price must be higher than the selling price."
      });
    }
  });

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
