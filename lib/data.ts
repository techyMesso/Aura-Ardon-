import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import type {
  AdminAnalytics,
  Category,
  Order,
  OrderItem,
  OrderStatus,
  Product
} from "@/lib/types";

// ─── PUBLIC (storefront) ──────────────────────────────────

/**
 * List all products ordered by newest.
 * Returns [] gracefully if Supabase isn't configured yet.
 * Cached for 2 minutes with tag-based invalidation for product changes.
 */
async function listPublicProductsInner(): Promise<Product[]> {
  if (!hasPublicSupabaseEnv()) return [];

  try {
    const supabase = createPublicServerSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, title, slug, description, category, category_id, price, stock_quantity, material, images, is_featured, active, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to list public products", { error: error.message });
      return [];
    }
    return data ?? [];
  } catch (err) {
    logger.error("Public products unavailable", {
      error: err instanceof Error ? err.message : String(err)
    });
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
    const supabase = createPublicServerSupabaseClient();
    
    // Try to get featured products first
    const { data: featuredData, error: featuredError } = await supabase
      .from("products")
      .select("id, title, slug, description, category, category_id, price, stock_quantity, material, images, is_featured, active, created_at")
      .eq("is_featured", true)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (featuredError) {
      logger.error("Failed to list featured products", { error: featuredError.message });
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
      logger.error("Failed to list featured products fallback", {
        error: newestError.message
      });
      return [];
    }

    return newestData ?? [];
  } catch (err) {
    logger.error("Featured products unavailable", {
      error: err instanceof Error ? err.message : String(err)
    });
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
    const supabase = createPublicServerSupabaseClient();

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
      logger.error("Failed to list products by category", {
        categorySlug,
        error: error.message
      });
      return [];
    }
    return data ?? [];
  } catch (err) {
    logger.error("Products by category unavailable", {
      categorySlug,
      error: err instanceof Error ? err.message : String(err)
    });
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
    const supabase = createPublicServerSupabaseClient();
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
    const supabase = createPublicServerSupabaseClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
      .order("display_order", { ascending: true });

    if (error) {
      logger.error("Failed to list categories", { error: error.message });
      return [];
    }
    return data ?? [];
  } catch (err) {
    logger.error("Categories unavailable", {
      error: err instanceof Error ? err.message : String(err)
    });
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
  const supabase = createAdminSupabaseClient();

  const [
    { data: products, error: productsError },
    { data: orders,   error: ordersError   },
    { data: categories, error: categoriesError },
  ] = await Promise.all([
    supabase.from("products").select("id, title, slug, description, category, category_id, price, stock_quantity, material, images, is_featured, active, created_at").order("created_at", { ascending: false }),
    supabase.from("orders").select("id, customer_name, customer_email, customer_phone, customer_location, notes, payment_method, payment_status, order_status, subtotal, shipping_fee, total, created_at").order("created_at",  { ascending: false }),
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
  const supabase = createAdminSupabaseClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, customer_name, customer_email, customer_phone, customer_location, notes, payment_method, payment_status, order_status, subtotal, shipping_fee, total, created_at")
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

type ListAdminOrdersParams = {
  status?: OrderStatus | "ALL";
  search?: string;
  from?: string;
  to?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function listAdminOrders(
  params: ListAdminOrdersParams = {}
): Promise<Order[]> {
  const supabase = createAdminSupabaseClient();
  const search = params.search?.trim();

  let query = supabase
    .from("orders")
    .select(
      "id, customer_name, customer_email, customer_phone, customer_location, notes, payment_method, payment_status, order_status, subtotal, shipping_fee, total, created_at"
    )
    .order("created_at", { ascending: false });

  if (params.status && params.status !== "ALL") {
    query = query.eq("order_status", params.status);
  }

  if (params.from) {
    query = query.gte("created_at", `${params.from}T00:00:00.000Z`);
  }

  if (params.to) {
    query = query.lte("created_at", `${params.to}T23:59:59.999Z`);
  }

  if (search) {
    if (isUuid(search)) {
      query = query.eq("id", search);
    } else {
      query = query.ilike("customer_phone", `%${search}%`);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Order[];
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const supabase = createAdminSupabaseClient();
  const ordersResponse = await supabase
    .from("orders")
    .select("id, total, created_at")
    .order("created_at", { ascending: true });
  const itemsResponse = await supabase
    .from("order_items")
    .select("product_title, quantity, unit_price");

  const orders = (ordersResponse.data ?? []) as Array<{
    id: string;
    total: string | number | null;
    created_at: string;
  }>;
  const items = (itemsResponse.data ?? []) as Array<{
    product_title: string;
    quantity: number;
    unit_price: string | number;
  }>;
  const ordersError = ordersResponse.error;
  const itemsError = itemsResponse.error;

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const revenue = orders.reduce(
    (sum, order) => sum + Number(order.total ?? 0),
    0
  );

  const ordersToday = orders.filter(
    order => new Date(order.created_at).getTime() >= startOfToday
  ).length;

  const ordersPerDayMap = new Map<string, number>();

  for (const order of orders) {
    const label = new Date(order.created_at).toLocaleDateString("en-KE", {
      month: "short",
      day: "numeric"
    });
    ordersPerDayMap.set(label, (ordersPerDayMap.get(label) ?? 0) + 1);
  }

  const productMap = new Map<string, { quantity: number; revenue: number }>();

  for (const item of items) {
    const current = productMap.get(item.product_title) ?? {
      quantity: 0,
      revenue: 0
    };
    current.quantity += item.quantity;
    current.revenue += Number(item.unit_price) * item.quantity;
    productMap.set(item.product_title, current);
  }

  const mostOrderedProducts = [...productMap.entries()]
    .map(([product_title, values]) => ({
      product_title,
      quantity: values.quantity,
      revenue: values.revenue
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  return {
    totalOrders: orders.length,
    ordersToday,
    revenue,
    mostOrderedProducts,
    ordersPerDay: [...ordersPerDayMap.entries()]
      .map(([label, value]) => ({ label, value }))
      .slice(-14),
    topProductsChart: mostOrderedProducts.map(product => ({
      label: product.product_title,
      value: product.quantity
    }))
  };
}
