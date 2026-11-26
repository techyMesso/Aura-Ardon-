import { z } from "zod";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const nullableOptionalText = (maxLength: number) =>
  z.preprocess(
    value => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maxLength).nullable().optional()
  );

const nullableOptionalPositiveMoney = z.preprocess(
  value => (value === "" || value === undefined || value === null ? null : value),
  z.coerce.number().positive("Price must be above zero.").nullable().optional()
);

const nullableOptionalNonNegativeMoney = z.preprocess(
  value => (value === "" || value === undefined || value === null ? null : value),
  z.coerce.number().min(0, "Cost price cannot be negative.").nullable().optional()
);

export const productStatusSchema = z.enum(["draft", "active", "archived"]);

const productFields = {
  title: z.string().trim().min(2, "Product title must be at least 2 characters.").max(120),
  slug: nullableOptionalText(140),
  description: z.string().trim().min(12, "Description must be at least 12 characters."),
  price: z.coerce.number().positive("Price must be above zero."),
  compare_at_price: nullableOptionalPositiveMoney,
  cost_price: nullableOptionalNonNegativeMoney,
  stock_quantity: z.coerce.number().int().min(0, "Stock quantity cannot be negative."),
  category_id: z.string().uuid("Select a valid category."),
  material: z.string().trim().min(1, "Material is required.").max(80),
  finish: nullableOptionalText(160),
  size_label: nullableOptionalText(160),
  water_resistance: nullableOptionalText(160),
  warranty: nullableOptionalText(160),
  ingredients: nullableOptionalText(600),
  net_weight: nullableOptionalText(120),
  expiry_info: nullableOptionalText(160),
  in_the_box: nullableOptionalText(240),
  care: nullableOptionalText(240),
  images: z.array(z.string().url("Each image must be a valid URL.")).min(1, "Add at least one image.").max(10),
  image_alts: z
    .array(z.string().trim().min(2, "Alt text is required for every image.").max(240))
    .min(1, "Alt text is required for every image.")
    .max(10),
  status: productStatusSchema.optional(),
  active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  featured_order: z.coerce.number().int().min(0).max(9999).optional(),
  is_new_in: z.boolean().optional(),
  new_in_order: z.coerce.number().int().min(0).max(9999).optional()
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
  if (data.image_alts.length !== data.images.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["image_alts"],
      message: "Every product image must have descriptive alt text."
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
    if (data.images !== undefined) {
      if (!data.image_alts || data.image_alts.length !== data.images.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["image_alts"],
          message: "Every product image must have descriptive alt text."
        });
      }
    }
  });

const nullableOptionalUrl = z.preprocess(
  value => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().url("Enter a valid image URL.").nullable().optional()
);

const variantFields = {
  name: z.string().trim().min(1, "Variant name is required (e.g. Gold / 40mm).").max(120),
  option_values: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(80)).optional().default({}),
  sku: z
    .string()
    .trim()
    .min(2, "Variant SKU is required.")
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, "SKU may only contain letters, numbers, hyphens, underscores, or dots."),
  price_override: nullableOptionalPositiveMoney,
  compare_at_price: nullableOptionalPositiveMoney,
  cost_price: nullableOptionalNonNegativeMoney,
  stock_quantity: z.coerce.number().int().min(0, "Variant stock cannot be negative.").default(0),
  image_url: nullableOptionalUrl,
  image_alt: nullableOptionalText(240),
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
  active: z.boolean().optional().default(true)
};

export const variantCreateSchema = z.object(variantFields).superRefine((data, ctx) => {
  if (data.image_url && !data.image_alt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["image_alt"],
      message: "Alt text is required when a variant image is set."
    });
  }
  if (
    data.compare_at_price != null &&
    data.price_override != null &&
    data.compare_at_price <= data.price_override
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["compare_at_price"],
      message: "Variant compare-at price must be higher than the variant price."
    });
  }
});

export const variantUpdateSchema = z
  .object(variantFields)
  .partial()
  .superRefine((data, ctx) => {
    if (data.image_url && data.image_alt !== undefined && !data.image_alt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["image_alt"],
        message: "Alt text is required when a variant image is set."
      });
    }
    if (
      data.compare_at_price != null &&
      data.price_override != null &&
      data.compare_at_price <= data.price_override
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["compare_at_price"],
        message: "Variant compare-at price must be higher than the variant price."
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
