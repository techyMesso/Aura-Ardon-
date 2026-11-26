import { z } from "zod";

import type { DiscountCode, DiscountCodeType, Product } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function normalizeDiscountCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isProductOnSale(
  product: Pick<Product, "price" | "compare_at_price">
): boolean {
  if (product.compare_at_price === null || product.compare_at_price === undefined) {
    return false;
  }
  const price = Number(product.price);
  const compareAt = Number(product.compare_at_price);
  return Number.isFinite(price) && Number.isFinite(compareAt) && compareAt > price;
}

export function getSaleSavingsPercent(
  product: Pick<Product, "price" | "compare_at_price">
): number {
  if (!isProductOnSale(product)) return 0;
  const price = Number(product.price);
  const compareAt = Number(product.compare_at_price);
  return Math.max(1, Math.round(((compareAt - price) / compareAt) * 100));
}

export function formatDiscountValueLabel(
  type: DiscountCodeType,
  value: string | number
): string {
  const num = Number(value ?? 0);
  if (type === "percent") {
    return `${num}% off`;
  }
  if (type === "fixed") {
    return `${formatCurrency(num)} off`;
  }
  return "Free delivery";
}

export function getDiscountLifecycleStatus(
  dc: Pick<DiscountCode, "active" | "starts_at" | "ends_at" | "usage_limit" | "used_count">,
  nowMs = Date.now()
): "active" | "scheduled" | "expired" | "exhausted" | "inactive" {
  if (!dc.active) return "inactive";
  if (dc.starts_at && Date.parse(dc.starts_at) > nowMs) return "scheduled";
  if (dc.ends_at && Date.parse(dc.ends_at) < nowMs) return "expired";
  if (dc.usage_limit !== null && dc.used_count >= dc.usage_limit) return "exhausted";
  return "active";
}

const optionalNullableNumber = z.preprocess(
  value => (value === "" || value === undefined || value === null ? null : value),
  z.coerce.number().int().positive().nullable()
);

const optionalNullableDateString = z.preprocess(
  value => (typeof value === "string" && value.trim() === "" ? null : value ?? null),
  z.string().datetime({ offset: true }).nullable()
);

export const discountCodePayloadSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Code must be at least 2 characters.")
      .max(32, "Code must be 32 characters or fewer.")
      .regex(/^[A-Za-z0-9_-]+$/, "Code may only contain letters, numbers, hyphens, and underscores.")
      .transform(normalizeDiscountCode),
    description: z.preprocess(
      value => (typeof value === "string" && value.trim() === "" ? null : value ?? null),
      z.string().trim().max(240).nullable()
    ),
    type: z.enum(["percent", "fixed", "free_delivery"]),
    value: z.coerce.number().min(0, "Discount value cannot be negative."),
    min_order_amount: z.coerce.number().min(0, "Minimum order cannot be negative.").default(0),
    starts_at: optionalNullableDateString,
    ends_at: optionalNullableDateString,
    usage_limit: optionalNullableNumber,
    per_phone_limit: optionalNullableNumber,
    first_order_only: z.boolean().default(false),
    active: z.boolean().default(true)
  })
  .superRefine((data, ctx) => {
    if (data.type === "percent" && (data.value <= 0 || data.value > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Percentage discount must be between 1 and 100."
      });
    }
    if (data.type === "fixed" && data.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Fixed discount amount must be greater than zero."
      });
    }
    if (
      data.starts_at &&
      data.ends_at &&
      Date.parse(data.ends_at) < Date.parse(data.starts_at)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ends_at"],
        message: "End date must be on or after the start date."
      });
    }
  });

