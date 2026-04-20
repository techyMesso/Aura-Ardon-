import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { unstable_cache } from "next/cache";
import type { Category, Order, OrderItem, Product } from "@/lib/types";

// ─── PUBLIC (storefront) ──────────────────────────────────

/**
 * List all products ordered by newest.
 * Returns [] gracefully if Supabase isn't configured yet.
 * Cached for 2 minutes with tag-based invalidation for product changes.
 */
async function listPublicProductsInner(): Promise<Product[]> {
  if (!hasPublicSupabaseEnv()) return [];

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, title, slug, description, category, category_id, price, stock_quantity, material, images, is_featured, active, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listPublicProducts]", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[listPublicProducts] Supabase not configured", err);
    return [];
  }
}

export const listPublicProducts = unstable_cache(listPublicProductsInner, ['public-products'], {
  tags: ['products'],
  revalidate: 120, // 2 minutes
});

/**
 * List featured products for the homepage hero.
 * Falls back to newest 6 if none are marked featured.
 * Cached for 5 minutes as featured products may change occasionally.
 */
async function listFeaturedProductsInner(limit = 6): Promise<Product[]> {
  if (!hasPublicSupabaseEnv()) return [];

  try {
    const supabase = await createServerSupabaseClient();
    
    // Try to get featured products first
    const { data: featuredData, error: featuredError } = await supabase
      .from("products")
      .select("id, title, slug, description, category, category_id, price, stock_quantity, material, images, is_featured, active, created_at")
      .eq("is_featured", true)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (featuredError) {
      console.error("[listFeaturedProducts]", featuredError.message);
      return [];
    }

    // If we have featured products, return them
    if (featuredData?.length) {
      return featuredData;
    }

    // Otherwise, fallback to newest active products
    const { data: newestData, error: newestError } = await supabase
      .from("products")
      .select("id, title, slug, description, category, category_id, price, stock_quantity, material, images, is_featured, active, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (newestError) {
      console.error("[listFeaturedProducts] Fallback error:", newestError.message);
      return [];
    }

    return newestData ?? [];
  } catch (err) {
    console.error("[listFeaturedProducts]", err);
    return [];
  }
}

export const listFeaturedProducts = unstable_cache(listFeaturedProductsInner, ['featured-products'], {
  tags: ['featured-products'],
  revalidate: 300, // 5 minutes
});

/**
 * List products filtered by category slug.
 */
export async function listProductsByCategory(
  categorySlug: string
): Promise<Product[]> {
  if (!hasPublicSupabaseEnv()) return [];

  try {
    const supabase = await createServerSupabaseClient();

    // First, resolve category slug → id
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", categorySlug)
      .single();

    if (!cat || !("id" in cat)) return [];

    const { data, error } = await supabase
      .from("products")
      .select("id, title, slug, description, category, category_id, price, stock_quantity, material, images, is_featured, active, created_at")
      .eq("category_id", (cat as { id: string }).id)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[listProductsByCategory]", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[listProductsByCategory]", err);
    return [];
  }
}

/**
 * Get a single product by its slug (for product detail page).
 */
export async function getProductBySlug(
  slug: string
): Promise<Product | null> {
  if (!hasPublicSupabaseEnv()) return null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, title, slug, description, category, category_id, price, stock_quantity, material, images, is_featured, active, created_at")
      .eq("slug", slug)
      .single();

    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * List all active categories for navigation and shop pages.
 * Cached for 1 hour as categories change infrequently.
 */
async function listCategoriesInner(): Promise<Category[]> {
  if (!hasPublicSupabaseEnv()) return [];

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("[listCategories]", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[listCategories]", err);
    return [];
  }
}

export const listCategories = unstable_cache(listCategoriesInner, ['categories'], {
  tags: ['categories'],
  revalidate: 3600, // 1 hour
});

// ─── ADMIN ────────────────────────────────────────────────

/**
 * Full data set for the admin dashboard.
 * Includes ALL products (including out-of-stock).
 * Optimized to select only needed columns.
 */
export async function listAdminDashboardData() {
  const supabase = await createServerSupabaseClient();

  const [
    { data: products, error: productsError },
    { data: orders,   error: ordersError   },
    { data: categories, error: categoriesError },
  ] = await Promise.all([
    supabase.from("products").select("id, title, slug, description, category, category_id, price, stock_quantity, material, images, is_featured, active, created_at").order("created_at", { ascending: false }),
    supabase.from("orders").select("id, customer_name, customer_email, customer_phone, customer_location, notes, payment_method, payment_status, order_status, subtotal, shipping_fee, total, mpesa_receipt_number, checkout_request_id, created_at").order("created_at",  { ascending: false }),
    supabase.from("categories").select("id, name, slug, parent_id, description, image_url, display_order, created_at").order("display_order", { ascending: true }),
  ]);

  if (productsError)   throw new Error(productsError.message);
  if (ordersError)     throw new Error(ordersError.message);
  if (categoriesError) throw new Error(categoriesError.message);

  return {
    products:   (products   ?? []) as Product[],
    orders:     (orders     ?? []) as Order[],
    categories: (categories ?? []) as Category[],
  };
}

/**
 * Get order with its line items (order detail view in admin).
 */
export async function getOrderWithItems(
  orderId: string
): Promise<{ order: Order; items: OrderItem[] } | null> {
  const supabase = await createServerSupabaseClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, customer_name, customer_email, customer_phone, customer_location, notes, payment_method, payment_status, order_status, subtotal, shipping_fee, total, mpesa_receipt_number, checkout_request_id, created_at")
    .eq("id", orderId)
    .single();

  if (orderError || !order) return null;

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id, order_id, product_id, product_title, quantity, unit_price, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (itemsError) return null;

  return { order, items: items ?? [] };
}
