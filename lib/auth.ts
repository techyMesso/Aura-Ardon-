import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { getAdminEmail } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Product, ProductVariant } from "@/lib/types";

export type AdminRole = "owner" | "staff";

function isAdminEmail(email: string | null | undefined) {
  return Boolean(email && email.toLowerCase() === getAdminEmail());
}

function matchesOptionalAdminEmail(email: string | null | undefined) {
  const configured = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(configured && email && email.toLowerCase() === configured);
}

/**
 * Determines whether an authenticated admin user has full owner privileges
 * (including viewing/editing cost prices, margins, settings, and user management).
 * Staff accounts (app_metadata.role === "staff") are explicitly excluded.
 */
export function getAdminRole(
  user: Pick<User, "email" | "app_metadata"> | null | undefined
): AdminRole | null {
  if (!user) return null;
  const metaRole =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role.toLowerCase()
      : null;

  if (metaRole === "staff") return "staff";
  if (metaRole === "owner" || matchesOptionalAdminEmail(user.email)) return "owner";
  return null;
}

export function isOwnerUser(
  user: Pick<User, "email" | "app_metadata"> | null | undefined
): boolean {
  return getAdminRole(user) === "owner";
}

export function stripVariantCostPrice<T extends Partial<ProductVariant>>(
  variant: T
): Omit<T, "cost_price"> {
  const clone = { ...variant };
  delete clone.cost_price;
  return clone;
}

export function stripProductCostPrice<T extends Partial<Product>>(
  product: T
): Omit<T, "cost_price"> {
  const clone = { ...product };
  delete clone.cost_price;
  if (Array.isArray(clone.variants)) {
    clone.variants = clone.variants.map(variant =>
      stripVariantCostPrice(variant)
    ) as ProductVariant[];
  }
  return clone;
}

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
}

export async function requireAdminPage() {
  const user = await getCurrentUser();

  if (!isAdminEmail(user?.email)) {
    redirect("/login");
  }

  return user;
}

export async function assertAdminRequest() {
  const user = await getCurrentUser();

  if (!isAdminEmail(user?.email)) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}
