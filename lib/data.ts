import { unstable_cache } from "next/cache";

import { buildAdminOrderSearchFilter } from "@/lib/admin-orders";
import { revalidateStoreSettings } from "@/lib/cache";
import { getSafeCatalogImageUrl } from "@/lib/catalog";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  DEFAULT_DELIVERY_ZONES,
  DEFAULT_MESSAGE_TEMPLATES,
  DEFAULT_STORE_CONFIG
} from "@/lib/site";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AdminAnalytics,
  Category,
  DeliveryZone,
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  Product,
  StoreMessageTemplates,
  StoreSettings,
  StoreSettingsUpdate
} from "@/lib/types";

const NAIROBI_TIME_ZONE = "Africa/Nairobi";

function toNairobiIsoDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NAIROBI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatIsoDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "UTC",
    month: "short",
    day: "numeric"
  }).format(utcDate);
}

// ─── PUBLIC (storefront) ──────────────────────────────────

async function fetchPublicProductsUncached(): Promise<Product[]> {
  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Product[];
}

const getCachedPublicProducts = unstable_cache(
  fetchPublicProductsUncached,
  ["public-products"],
  {
    tags: ["products"],
    revalidate: 300
  }
);

/**
 * List all active products ordered by newest.
 * Errors throw inside unstable_cache so transient failures are never cached as [].
 */
export async function listPublicProducts(): Promise<Product[]> {
  if (!hasPublicSupabaseEnv()) return [];
  try {
    return await getCachedPublicProducts();
  } catch (err) {
    logger.error("Failed to list public products", {
      error: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
}

/**
 * Lightweight catalog projection for layout-level client providers (search, wishlist, recently viewed).
 * Reduces RSC hydration payload size while keeping the Product shape compatible.
 */
export async function listPublicProductIndex(): Promise<Product[]> {
  const products = await listPublicProducts();
  return products.map(product => ({
    id: product.id,
    title: product.title,
    slug: product.slug,
    description: product.description.slice(0, 140),
    category: product.category,
    category_id: product.category_id,
    price: product.price,
    stock_quantity: product.stock_quantity,
    material: product.material,
    images: product.images.slice(0, 2),
    is_featured: product.is_featured,
    active: product.active,
    blur_data_url: product.blur_data_url ?? null,
    created_at: product.created_at
  }));
}

async function fetchFeaturedProductsUncached(limit: number): Promise<Product[]> {
  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_featured", true)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Product[];
}

export async function listFeaturedProducts(limit = 6): Promise<Product[]> {
  if (!hasPublicSupabaseEnv()) return [];
  try {
    return await unstable_cache(
      () => fetchFeaturedProductsUncached(limit),
      ["featured-products", String(limit)],
      {
        tags: ["products", "featured-products"],
        revalidate: 300
      }
    )();
  } catch (err) {
    logger.error("Failed to list featured products", {
      error: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
}

async function fetchProductsByCategoryUncached(categorySlug: string): Promise<Product[]> {
  const supabase = createPublicServerSupabaseClient();

  const { data: cat, error: catError } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", categorySlug)
    .maybeSingle();

  if (catError) {
    throw new Error(catError.message);
  }

  if (!cat || !("id" in cat)) return [];

  const categoryId = (cat as { id: string }).id;
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category_id", categoryId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Product[];
}

export async function listProductsByCategory(categorySlug: string): Promise<Product[]> {
  if (!hasPublicSupabaseEnv()) return [];
  try {
    return await unstable_cache(
      () => fetchProductsByCategoryUncached(categorySlug),
      ["products-by-category", categorySlug],
      { tags: ["products", "categories"], revalidate: 300 }
    )();
  } catch (err) {
    logger.error("Failed to list products by category", {
      categorySlug,
      error: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
}

async function fetchProductBySlugUncached(slug: string): Promise<Product | null> {
  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (data) {
    return data as Product;
  }

  // Legacy UUID fallback when old links use product ID instead of slug
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      slug
    );
  if (!isUuid) return null;

  const { data: legacyData, error: legacyError } = await supabase
    .from("products")
    .select("*")
    .eq("id", slug)
    .eq("active", true)
    .maybeSingle();

  if (legacyError) {
    throw new Error(legacyError.message);
  }
  return (legacyData as Product | null) ?? null;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (!hasPublicSupabaseEnv()) return null;
  try {
    return await unstable_cache(
      () => fetchProductBySlugUncached(slug),
      ["product-by-slug", slug],
      { tags: ["products", "categories"], revalidate: 300 }
    )();
  } catch (err) {
    logger.error("Failed to fetch product by slug", {
      slug,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

async function fetchCategoriesUncached(): Promise<Category[]> {
  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Category[];
}

const getCachedCategories = unstable_cache(
  fetchCategoriesUncached,
  ["categories"],
  {
    tags: ["categories"],
    revalidate: 3600
  }
);

export async function listCategories(): Promise<Category[]> {
  if (!hasPublicSupabaseEnv()) return [];
  try {
    return await getCachedCategories();
  } catch (err) {
    logger.error("Failed to list categories", {
      error: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
}

export type CategoryRepresentative = {
  category_id: string;
  image_url: string;
};

export function deriveCategoryRepresentatives(
  products: Pick<Product, "category_id" | "images" | "is_featured" | "created_at">[]
): CategoryRepresentative[] {
  const sorted = [...products].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });

  const representatives = new Map<string, string>();
  const usedImages = new Set<string>();

  for (const record of sorted) {
    if (!record.category_id || representatives.has(record.category_id)) continue;
    const validImages = (record.images ?? [])
      .map(getSafeCatalogImageUrl)
      .filter((value): value is string => Boolean(value));
    const uniqueImage =
      validImages.find(url => !usedImages.has(url)) ?? validImages[0];
    if (uniqueImage) {
      representatives.set(record.category_id, uniqueImage);
      usedImages.add(uniqueImage);
    }
  }

  return [...representatives].map(([category_id, image_url]) => ({
    category_id,
    image_url
  }));
}

export async function listCategoryRepresentatives(): Promise<CategoryRepresentative[]> {
  const products = await listPublicProducts();
  return deriveCategoryRepresentatives(products);
}

// ─── STORE SETTINGS & DELIVERY ZONES (Phase 0) ───────────

function buildFallbackStoreSettings(): StoreSettings {
  return {
    id: true,
    ...DEFAULT_STORE_CONFIG,
    message_templates: { ...DEFAULT_MESSAGE_TEMPLATES },
    updated_at: new Date(0).toISOString()
  };
}

function normalizeStoreSettingsRow(row: Record<string, unknown>): StoreSettings {
  const fallback = buildFallbackStoreSettings();
  const rawTemplates =
    row.message_templates && typeof row.message_templates === "object"
      ? (row.message_templates as Partial<StoreMessageTemplates>)
      : {};

  return {
    id: true,
    site_name: typeof row.site_name === "string" && row.site_name.trim() ? row.site_name : fallback.site_name,
    business_phone:
      typeof row.business_phone === "string" && row.business_phone.trim()
        ? row.business_phone
        : fallback.business_phone,
    business_email: typeof row.business_email === "string" ? row.business_email : null,
    business_address:
      typeof row.business_address === "string" && row.business_address.trim()
        ? row.business_address
        : fallback.business_address,
    kra_pin: typeof row.kra_pin === "string" ? row.kra_pin : null,
    logo_url: typeof row.logo_url === "string" ? row.logo_url : null,
    whatsapp_number:
      typeof row.whatsapp_number === "string" && row.whatsapp_number.trim()
        ? row.whatsapp_number
        : fallback.whatsapp_number,
    currency: typeof row.currency === "string" && row.currency.trim() ? row.currency : fallback.currency,
    timezone: typeof row.timezone === "string" && row.timezone.trim() ? row.timezone : fallback.timezone,
    business_hours:
      typeof row.business_hours === "string" && row.business_hours.trim()
        ? row.business_hours
        : fallback.business_hours,
    same_day_cutoff:
      typeof row.same_day_cutoff === "string" && row.same_day_cutoff.trim()
        ? row.same_day_cutoff
        : fallback.same_day_cutoff,
    pending_auto_cancel_hours:
      typeof row.pending_auto_cancel_hours === "number" && row.pending_auto_cancel_hours > 0
        ? row.pending_auto_cancel_hours
        : fallback.pending_auto_cancel_hours,
    low_stock_default:
      typeof row.low_stock_default === "number" && row.low_stock_default >= 0
        ? row.low_stock_default
        : fallback.low_stock_default,
    free_delivery_threshold:
      Number.isFinite(Number(row.free_delivery_threshold))
        ? Number(row.free_delivery_threshold)
        : fallback.free_delivery_threshold,
    instagram_url: typeof row.instagram_url === "string" ? row.instagram_url : "",
    tiktok_url: typeof row.tiktok_url === "string" ? row.tiktok_url : "",
    is_store_open: typeof row.is_store_open === "boolean" ? row.is_store_open : true,
    holiday_banner_message:
      typeof row.holiday_banner_message === "string" ? row.holiday_banner_message : "",
    invoice_footer:
      typeof row.invoice_footer === "string" ? row.invoice_footer : fallback.invoice_footer,
    payment_instructions:
      typeof row.payment_instructions === "string"
        ? row.payment_instructions
        : fallback.payment_instructions,
    message_templates: {
      ...DEFAULT_MESSAGE_TEMPLATES,
      ...rawTemplates
    },
    updated_at: typeof row.updated_at === "string" ? row.updated_at : fallback.updated_at
  };
}

async function fetchStoreSettingsUncached(): Promise<StoreSettings> {
  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return buildFallbackStoreSettings();
  }
  return normalizeStoreSettingsRow(data as Record<string, unknown>);
}

const getCachedStoreSettings = unstable_cache(
  fetchStoreSettingsUncached,
  ["store-settings"],
  {
    tags: ["store-settings"],
    revalidate: 300
  }
);

export async function getStoreSettings(): Promise<StoreSettings> {
  if (!hasPublicSupabaseEnv()) {
    return buildFallbackStoreSettings();
  }
  try {
    return await getCachedStoreSettings();
  } catch (err) {
    logger.warn("Falling back to default store settings", {
      error: err instanceof Error ? err.message : String(err)
    });
    return buildFallbackStoreSettings();
  }
}

export async function saveStoreSettings(
  updates: StoreSettingsUpdate
): Promise<StoreSettings> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("store_settings")
    .upsert({ id: true, ...updates } as never, { onConflict: "id" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to save store settings.");
  }

  revalidateStoreSettings();
  return normalizeStoreSettingsRow(data as Record<string, unknown>);
}

function buildFallbackDeliveryZones(): DeliveryZone[] {
  const epoch = new Date(0).toISOString();
  return DEFAULT_DELIVERY_ZONES.map((zone, index) => ({
    id: `default-zone-${index + 1}`,
    ...zone,
    created_at: epoch,
    updated_at: epoch
  }));
}

async function fetchDeliveryZonesUncached(): Promise<DeliveryZone[]> {
  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("id, name, fee, active, sort_order, is_outside_nairobi, created_at, updated_at")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    name: String(row.name),
    fee: Number(row.fee ?? 0),
    active: Boolean(row.active),
    sort_order: Number(row.sort_order ?? 0),
    is_outside_nairobi: Boolean(row.is_outside_nairobi),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? "")
  }));
}

const getCachedDeliveryZones = unstable_cache(
  fetchDeliveryZonesUncached,
  ["delivery-zones"],
  {
    tags: ["delivery-zones"],
    revalidate: 300
  }
);

export async function listDeliveryZones(): Promise<DeliveryZone[]> {
  if (!hasPublicSupabaseEnv()) {
    return buildFallbackDeliveryZones();
  }
  try {
    const zones = await getCachedDeliveryZones();
    return zones.length > 0 ? zones : buildFallbackDeliveryZones();
  } catch (err) {
    logger.warn("Falling back to default delivery zones", {
      error: err instanceof Error ? err.message : String(err)
    });
    return buildFallbackDeliveryZones();
  }
}

export async function listAllDeliveryZones(): Promise<DeliveryZone[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("id, name, fee, active, sort_order, is_outside_nairobi, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    name: String(row.name),
    fee: Number(row.fee ?? 0),
    active: Boolean(row.active),
    sort_order: Number(row.sort_order ?? 0),
    is_outside_nairobi: Boolean(row.is_outside_nairobi),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? "")
  }));
}

// ─── ADMIN ────────────────────────────────────────────────

export async function listAdminDashboardData() {
  const supabase = createAdminSupabaseClient();

  const [
    { data: products, error: productsError },
    { data: orders, error: ordersError },
    { data: categories, error: categoriesError }
  ] = await Promise.all([
    supabase.from("products").select("*").order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select(
        "id, customer_name, customer_email, customer_phone, customer_location, notes, payment_method, payment_status, order_status, subtotal, shipping_fee, total, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, slug, parent_id, description, image_url, display_order, created_at")
      .order("display_order", { ascending: true })
  ]);

  if (productsError) throw new Error(productsError.message);
  if (ordersError) throw new Error(ordersError.message);
  if (categoriesError) throw new Error(categoriesError.message);

  return {
    products: (products ?? []) as Product[],
    orders: (orders ?? []) as Order[],
    categories: (categories ?? []) as Category[]
  };
}

export async function getOrderWithItems(
  orderId: string
): Promise<{ order: Order; items: OrderItem[] } | null> {
  const supabase = createAdminSupabaseClient();

  const [{ data: order, error: orderError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, customer_name, customer_email, customer_phone, customer_location, notes, payment_method, payment_status, order_status, subtotal, shipping_fee, total, created_at"
        )
        .eq("id", orderId)
        .maybeSingle(),
      supabase
        .from("order_items")
        .select("id, order_id, product_id, product_title, quantity, unit_price, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true })
    ]);

  if (orderError || !order || itemsError) return null;

  return { order: order as Order, items: (items ?? []) as OrderItem[] };
}

export async function getOrderByNumber(
  orderNumber: string
): Promise<{ order: Order; items: OrderItem[] } | null> {
  const normalized = orderNumber.trim().toUpperCase();
  if (!normalized) return null;

  const supabase = createAdminSupabaseClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, order_number, channel, status, customer_id, customer_name, customer_email, customer_phone, customer_location, delivery_zone_id, delivery_zone_name, delivery_address, town_county, notes, is_gift, gift_note, hide_prices, marketing_opt_in, discount_code, discount_amount, payment_method, payment_status, order_status, subtotal, shipping_fee, total, created_at"
    )
    .eq("order_number", normalized)
    .maybeSingle();

  if (orderError || !order) return null;

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id, order_id, product_id, product_title, quantity, unit_price, created_at")
    .eq("order_id", (order as { id: string }).id)
    .order("created_at", { ascending: true });

  if (itemsError) return null;

  return { order: order as Order, items: (items ?? []) as OrderItem[] };
}

type ListAdminOrdersParams = {
  status?: OrderStatus | "ALL";
  paymentStatus?: PaymentStatus | "ALL";
  search?: string;
  from?: string;
  to?: string;
};

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

  if (params.paymentStatus && params.paymentStatus !== "ALL") {
    query = query.eq("payment_status", params.paymentStatus);
  }

  if (params.from) {
    query = query.gte("created_at", `${params.from}T00:00:00.000+03:00`);
  }

  if (params.to) {
    query = query.lte("created_at", `${params.to}T23:59:59.999+03:00`);
  }

  if (search) {
    query = query.or(buildAdminOrderSearchFilter(search));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Order[];
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const supabase = createAdminSupabaseClient();
  const [ordersResponse, itemsResponse] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total, order_status, created_at")
      .neq("order_status", "CANCELLED")
      .order("created_at", { ascending: true }),
    supabase
      .from("order_items")
      .select("order_id, product_title, quantity, unit_price")
  ]);

  if (ordersResponse.error) {
    throw new Error(ordersResponse.error.message);
  }
  if (itemsResponse.error) {
    throw new Error(itemsResponse.error.message);
  }

  const orders = (ordersResponse.data ?? []) as Array<{
    id: string;
    total: string | number | null;
    order_status: OrderStatus;
    created_at: string;
  }>;
  const validOrderIds = new Set(orders.map(order => order.id));
  const items = ((itemsResponse.data ?? []) as Array<{
    order_id: string;
    product_title: string;
    quantity: number;
    unit_price: string | number;
  }>).filter(item => validOrderIds.has(item.order_id));

  const todayNairobi = toNairobiIsoDate(new Date());
  let revenue = 0;
  let ordersToday = 0;
  const ordersPerDayMap = new Map<string, number>();

  for (const order of orders) {
    const amount = Number(order.total ?? 0);
    if (Number.isFinite(amount)) {
      revenue += amount;
    }

    const orderDate = new Date(order.created_at);
    if (!Number.isNaN(orderDate.getTime())) {
      const isoDay = toNairobiIsoDate(orderDate);
      if (isoDay === todayNairobi) {
        ordersToday += 1;
      }
      ordersPerDayMap.set(isoDay, (ordersPerDayMap.get(isoDay) ?? 0) + 1);
    }
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
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 5);

  const ordersPerDay = [...ordersPerDayMap.entries()]
    .sort(([leftDay], [rightDay]) => leftDay.localeCompare(rightDay))
    .slice(-14)
    .map(([isoDay, value]) => ({
      label: formatIsoDateLabel(isoDay),
      value
    }));

  return {
    totalOrders: orders.length,
    ordersToday,
    revenue,
    mostOrderedProducts,
    ordersPerDay,
    topProductsChart: mostOrderedProducts.map(product => ({
      label: product.product_title,
      value: product.quantity
    }))
  };
}
