import { unstable_cache } from "next/cache";

import {
  buildAdminOrderSearchFilter,
  mapLegacyStatusToCanonical,
  resolveCanonicalOrderStatus
} from "@/lib/admin-orders";
import { getCatalogQualityWarnings } from "@/lib/admin-product-filters";
import { buildEmptyAnalyticsDashboardReport } from "@/lib/analytics";
import { revalidateStoreSettings } from "@/lib/cache";
import { getSafeCatalogImageUrl } from "@/lib/catalog";
import { hasPublicSupabaseEnv } from "@/lib/env";
import {
  buildDailyCashupReport,
  buildMonthlySummaryReport,
  isShareTokenActive
} from "@/lib/invoices";
import { logger } from "@/lib/logger";
import { buildOrderTemplateLinks } from "@/lib/message-templates";
import { buildDailySummaryReport } from "@/lib/notifications";
import { createOrderNumberToken } from "@/lib/order-status-token";
import {
  buildDeliveryMarginReport,
  buildDispatchSheetReport,
  sanitizeZoneCosts
} from "@/lib/riders";
import {
  computeApprovedReviewAggregate,
  formatReviewerDisplayName
} from "@/lib/reviews";
import {
  buildSetupChecklist,
  countUniqueProductsWithCatalogWarnings,
  type SetupChecklistSummary
} from "@/lib/setup-checklist";
import {
  DEFAULT_DELIVERY_ZONES,
  DEFAULT_MESSAGE_TEMPLATES,
  DEFAULT_STORE_CONFIG,
  SITE_URL
} from "@/lib/site";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeKenyanPhoneNumber } from "@/lib/utils";
import type {
  AdminAnalytics,
  AdminDeliveryZone,
  AdminPushSubscription,
  AdminReviewRecord,
  AnalyticsDashboardReport,
  BackInStockAlert,
  BackInStockAlertStatus,
  CanonicalOrderStatus,
  Category,
  CreditNote,
  Customer,
  CustomerDetailBundle,
  DailyCashupReport,
  DailySummaryReport,
  DeliveryMarginReport,
  DeliveryZone,
  DispatchSheetReport,
  Invoice,
  InvoiceDetailBundle,
  InvoicePayment,
  InvoicePaymentMethod,
  InvoiceStatus,
  MonthlySummaryReport,
  Order,
  OrderItem,
  OrderReturnRecord,
  OrderStatus,
  OrderStatusHistoryEntry,
  OrderTemplateWhatsAppUrls,
  PaymentStatus,
  Product,
  ProductVariant,
  PublicProductReview,
  RedirectRecord,
  ReviewStatus,
  Rider,
  StockIntegrityDiscrepancy,
  StockMovement,
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
// Explicitly exclude cost_price on all public selects (reinforced by Postgres column grants).

export const PUBLIC_PRODUCT_SELECT: string =
  "id, title, slug, description, category, category_id, price, compare_at_price, stock_quantity, material, finish, size_label, water_resistance, warranty, ingredients, net_weight, expiry_info, in_the_box, care, images, image_alts, blur_data_url, is_featured, featured_order, is_new_in, new_in_order, active, status, created_at";

export const OWNER_PRODUCT_SELECT: string =
  "id, title, slug, description, category, category_id, price, compare_at_price, cost_price, stock_quantity, material, finish, size_label, water_resistance, warranty, ingredients, net_weight, expiry_info, in_the_box, care, images, image_alts, blur_data_url, is_featured, featured_order, is_new_in, new_in_order, active, status, created_at";

export const PUBLIC_VARIANT_SELECT: string =
  "id, product_id, name, option_values, sku, price_override, compare_at_price, stock_quantity, image_url, image_alt, sort_order, active, created_at, updated_at";

export const OWNER_VARIANT_SELECT: string =
  "id, product_id, name, option_values, sku, price_override, compare_at_price, cost_price, stock_quantity, image_url, image_alt, sort_order, active, created_at, updated_at";

function hasUsableServiceRoleKey(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(key && key !== "staging-build-check-placeholder");
}

async function fetchApprovedReviewStatsMapUncached(): Promise<
  Record<string, { avg: number; count: number }>
> {
  if (!hasPublicSupabaseEnv() || !hasUsableServiceRoleKey()) {
    return {};
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("product_id, rating")
    .eq("status", "approved");

  if (error) {
    throw new Error(error.message);
  }

  const grouped = new Map<string, Array<{ rating: number }>>();
  for (const row of (data ?? []) as Array<{ product_id: string; rating: number }>) {
    const list = grouped.get(row.product_id) ?? [];
    list.push({ rating: Number(row.rating) });
    grouped.set(row.product_id, list);
  }

  const stats: Record<string, { avg: number; count: number }> = {};
  for (const [productId, ratings] of grouped.entries()) {
    const aggregate = computeApprovedReviewAggregate(ratings);
    if (aggregate) {
      stats[productId] = {
        avg: aggregate.ratingValue,
        count: aggregate.reviewCount
      };
    }
  }
  return stats;
}

const getCachedApprovedReviewStatsMap = unstable_cache(
  fetchApprovedReviewStatsMapUncached,
  ["approved-review-stats"],
  {
    tags: ["reviews"],
    revalidate: 300
  }
);

async function getApprovedReviewStatsMap(): Promise<
  Record<string, { avg: number; count: number }>
> {
  if (!hasPublicSupabaseEnv() || !hasUsableServiceRoleKey()) {
    return {};
  }
  try {
    return await getCachedApprovedReviewStatsMap();
  } catch (err) {
    logger.warn("Unable to attach approved review stats", {
      error: err instanceof Error ? err.message : String(err)
    });
    return {};
  }
}

async function attachPublicVariants(products: Product[]): Promise<Product[]> {
  if (products.length === 0) return products;
  const supabase = createPublicServerSupabaseClient();
  const productIds = products.map(product => product.id);
  const [{ data: variantRows, error }, reviewStatsMap] = await Promise.all([
    supabase
      .from("product_variants")
      .select(PUBLIC_VARIANT_SELECT)
      .in("product_id", productIds)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    getApprovedReviewStatsMap()
  ]);

  if (error) {
    logger.warn("Unable to attach product variants", { error: error.message });
  }

  const byProductId = new Map<string, ProductVariant[]>();
  if (!error) {
    for (const variant of (variantRows ?? []) as unknown as ProductVariant[]) {
      const list = byProductId.get(variant.product_id) ?? [];
      list.push(variant);
      byProductId.set(variant.product_id, list);
    }
  }

  return products.map(product => {
    const stats = reviewStatsMap[product.id];
    return {
      ...product,
      variants: error ? (product.variants ?? []) : (byProductId.get(product.id) ?? []),
      ...(stats && stats.count > 0
        ? {
            review_rating_avg: stats.avg,
            review_count: stats.count
          }
        : {})
    };
  });
}

async function fetchPublicProductsUncached(): Promise<Product[]> {
  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("status", "active")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  return attachPublicVariants((data ?? []) as unknown as Product[]);
}

const getCachedPublicProducts = unstable_cache(
  fetchPublicProductsUncached,
  ["public-products"],
  {
    tags: ["products", "reviews"],
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
 * Reduces RSC hydration payload size while keeping the Product shape compatible and excluding cost_price.
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
    compare_at_price: product.compare_at_price ?? null,
    stock_quantity: product.stock_quantity,
    material: product.material,
    images: product.images.slice(0, 2),
    image_alts: (product.image_alts ?? []).slice(0, 2),
    is_featured: product.is_featured,
    featured_order: product.featured_order ?? 0,
    is_new_in: product.is_new_in ?? false,
    new_in_order: product.new_in_order ?? 0,
    active: product.active,
    status: product.status ?? "active",
    blur_data_url: product.blur_data_url ?? null,
    variants: product.variants ?? [],
    ...(product.review_count && product.review_count > 0 && product.review_rating_avg != null
      ? {
          review_rating_avg: product.review_rating_avg,
          review_count: product.review_count
        }
      : {}),
    created_at: product.created_at
  }));
}

async function fetchFeaturedProductsUncached(limit: number): Promise<Product[]> {
  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("is_featured", true)
    .eq("status", "active")
    .eq("active", true)
    .order("featured_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }
  return attachPublicVariants((data ?? []) as unknown as Product[]);
}

export async function listFeaturedProducts(limit = 6): Promise<Product[]> {
  if (!hasPublicSupabaseEnv()) return [];
  try {
    return await unstable_cache(
      () => fetchFeaturedProductsUncached(limit),
      ["featured-products", String(limit)],
      {
        tags: ["products", "featured-products", "reviews"],
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
    .eq("active", true)
    .maybeSingle();

  if (catError) {
    throw new Error(catError.message);
  }

  if (!cat || !("id" in cat)) return [];

  const categoryId = (cat as { id: string }).id;
  const { data, error } = await supabase
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("category_id", categoryId)
    .eq("status", "active")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return attachPublicVariants((data ?? []) as unknown as Product[]);
}

export async function listProductsByCategory(categorySlug: string): Promise<Product[]> {
  if (!hasPublicSupabaseEnv()) return [];
  try {
    return await unstable_cache(
      () => fetchProductsByCategoryUncached(categorySlug),
      ["products-by-category", categorySlug],
      { tags: ["products", "categories", "reviews"], revalidate: 300 }
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
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("status", "active")
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (data) {
    const typed = data as unknown as Product;
    const [enriched] = await attachPublicVariants([typed]);
    return enriched ?? typed;
  }

  // Legacy UUID fallback when old links use product ID instead of slug
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      slug
    );
  if (!isUuid) return null;

  const { data: legacyData, error: legacyError } = await supabase
    .from("products")
    .select(PUBLIC_PRODUCT_SELECT)
    .eq("id", slug)
    .eq("status", "active")
    .eq("active", true)
    .maybeSingle();

  if (legacyError) {
    throw new Error(legacyError.message);
  }
  if (!legacyData) return null;
  const typedLegacy = legacyData as unknown as Product;
  const [enriched] = await attachPublicVariants([typedLegacy]);
  return enriched ?? typedLegacy;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (!hasPublicSupabaseEnv()) return null;
  try {
    return await unstable_cache(
      () => fetchProductBySlugUncached(slug),
      ["product-by-slug", slug],
      { tags: ["products", "categories", "reviews"], revalidate: 300 }
    )();
  } catch (err) {
    logger.error("Failed to fetch product by slug", {
      slug,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

export async function getActiveRedirect(pathname: string): Promise<RedirectRecord | null> {
  if (!hasPublicSupabaseEnv()) return null;
  const normalized = pathname.trim().replace(/\/+$/, "").toLowerCase();
  if (!normalized) return null;
  try {
    const supabase = createPublicServerSupabaseClient();
    const { data, error } = await supabase
      .from("redirects")
      .select("id, from_path, to_path, status_code, entity_type, entity_id, active, created_at, updated_at")
      .ilike("from_path", normalized)
      .eq("active", true)
      .maybeSingle();

    if (error || !data) return null;
    return data as RedirectRecord;
  } catch {
    return null;
  }
}

async function fetchCategoriesUncached(): Promise<Category[]> {
  const supabase = createPublicServerSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, description, image_url, display_order, active, created_at")
    .eq("active", true)
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
    sms_notifications_enabled: Boolean(row.sms_notifications_enabled ?? false),
    legal_reviewed_at:
      typeof row.legal_reviewed_at === "string" ? row.legal_reviewed_at : null,
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

export async function listAdminDeliveryZonesWithCounts(): Promise<AdminDeliveryZone[]> {
  const supabase = createAdminSupabaseClient();
  const [zones, ordersRes] = await Promise.all([
    listAllDeliveryZones(),
    supabase
      .from("orders")
      .select("delivery_zone_id")
      .not("delivery_zone_id", "is", null)
  ]);

  if (ordersRes.error) {
    throw new Error(ordersRes.error.message);
  }

  const counts = new Map<string, number>();
  for (const row of (ordersRes.data ?? []) as Array<{ delivery_zone_id?: string | null }>) {
    if (!row.delivery_zone_id) continue;
    counts.set(row.delivery_zone_id, (counts.get(row.delivery_zone_id) ?? 0) + 1);
  }

  return zones.map(zone => ({
    ...zone,
    order_count: counts.get(zone.id) ?? 0
  }));
}

// ─── ADMIN ────────────────────────────────────────────────

const ADMIN_ORDER_SELECT: string =
  "id, order_number, channel, status, is_test, customer_id, customer_name, customer_email, customer_phone, customer_location, delivery_zone_id, delivery_zone_name, delivery_address, town_county, notes, is_gift, gift_note, hide_prices, marketing_opt_in, discount_code, discount_amount, cancel_reason, cancel_note, cancelled_at, restocked_at, returned_at, needs_review, review_reason, rider_id, rider_name, rider_phone, rider_cost, dispatched_at, payment_method, payment_status, order_status, subtotal, shipping_fee, total, created_at";

interface OrderPaymentSummary {
  amount_paid: number;
  credited_amount: number;
  credit_note_count: number;
  invoice_status: InvoiceStatus | null;
}

const VALID_INVOICE_STATUSES = new Set<string>([
  "unpaid",
  "partially_paid",
  "paid",
  "void"
]);

function normalizeInvoiceStatus(raw: unknown): InvoiceStatus | null {
  return typeof raw === "string" && VALID_INVOICE_STATUSES.has(raw)
    ? (raw as InvoiceStatus)
    : null;
}

async function fetchOrderPaymentSummaryMap(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  orderIds: string[]
): Promise<Map<string, OrderPaymentSummary>> {
  const uniqueIds = Array.from(new Set(orderIds.filter(Boolean)));
  const summaryMap = new Map<string, OrderPaymentSummary>();
  if (uniqueIds.length === 0) return summaryMap;

  if (typeof supabase.rpc === "function") {
    try {
      const { data, error } = await supabase.rpc(
        "get_order_payment_summaries" as never,
        { p_order_ids: uniqueIds } as never
      );
      if (!error && Array.isArray(data)) {
        for (const row of data as Array<Record<string, unknown>>) {
          const id = typeof row.order_id === "string" ? row.order_id : null;
          if (!id) continue;
          summaryMap.set(id, {
            amount_paid: Number(row.amount_paid ?? 0) || 0,
            credited_amount: Number(row.credited_amount ?? 0) || 0,
            credit_note_count: Number(row.credit_note_count ?? 0) || 0,
            invoice_status: normalizeInvoiceStatus(row.invoice_status)
          });
        }
        return summaryMap;
      }
    } catch {
      // Fallback to direct table queries below when RPC is unavailable or mocked
    }
  }

  try {
    const invoicesTable = supabase.from("invoices");
    const creditNotesTable = supabase.from("credit_notes");
    if (
      !invoicesTable ||
      typeof invoicesTable.select !== "function" ||
      !creditNotesTable ||
      typeof creditNotesTable.select !== "function"
    ) {
      return summaryMap;
    }

    const [invoicesRes, creditNotesRes] = await Promise.all([
      invoicesTable
        .select("order_id, status, amount_paid, credited_amount")
        .in("order_id", uniqueIds),
      creditNotesTable
        .select("order_id, amount")
        .in("order_id", uniqueIds)
    ]);

    for (const row of (invoicesRes.data ?? []) as Array<Record<string, unknown>>) {
      const id = typeof row.order_id === "string" ? row.order_id : null;
      if (!id) continue;
      summaryMap.set(id, {
        amount_paid: Number(row.amount_paid ?? 0) || 0,
        credited_amount: Number(row.credited_amount ?? 0) || 0,
        credit_note_count: 0,
        invoice_status: normalizeInvoiceStatus(row.status)
      });
    }

    for (const row of (creditNotesRes.data ?? []) as Array<Record<string, unknown>>) {
      const id = typeof row.order_id === "string" ? row.order_id : null;
      if (!id) continue;
      const existing = summaryMap.get(id) ?? {
        amount_paid: 0,
        credited_amount: 0,
        credit_note_count: 0,
        invoice_status: null
      };
      const cnAmount = Number(row.amount ?? 0) || 0;
      existing.credit_note_count += 1;
      existing.credited_amount = Math.max(existing.credited_amount, cnAmount);
      summaryMap.set(id, existing);
    }
  } catch {
    // Gracefully return empty summary map in lightweight test mocks
  }

  return summaryMap;
}

export async function listAdminDashboardData() {
  const supabase = createAdminSupabaseClient();

  const [
    { data: products, error: productsError },
    { data: orders, error: ordersError },
    { data: categories, error: categoriesError },
    { data: returns, error: returnsError }
  ] = await Promise.all([
    supabase
      .from("products")
      .select(PUBLIC_PRODUCT_SELECT)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select(ADMIN_ORDER_SELECT)
      .order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, slug, parent_id, description, image_url, display_order, active, created_at")
      .order("display_order", { ascending: true }),
    supabase
      .from("order_returns")
      .select("id, order_id, order_item_id, product_id, product_title, quantity, unit_price, refund_amount, condition, note, created_by, created_at")
      .order("created_at", { ascending: false })
  ]);

  if (productsError) throw new Error(productsError.message);
  if (ordersError) throw new Error(ordersError.message);
  if (categoriesError) throw new Error(categoriesError.message);
  if (returnsError) {
    logger.warn("Unable to load order_returns for dashboard overview", {
      error: returnsError.message
    });
  }

  return {
    products: (products ?? []) as unknown as Product[],
    orders: (orders ?? []) as unknown as Order[],
    categories: (categories ?? []) as Category[],
    returns: (returns ?? []) as OrderReturnRecord[]
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
        .select(ADMIN_ORDER_SELECT)
        .eq("id", orderId)
        .maybeSingle(),
      supabase
        .from("order_items")
        .select("id, order_id, product_id, variant_id, variant_name, variant_sku, product_title, quantity, unit_price, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true })
    ]);

  if (orderError || !order || itemsError) return null;

  return { order: order as unknown as Order, items: (items ?? []) as OrderItem[] };
}

export async function getOrderDetailBundle(orderId: string): Promise<{
  order: Order;
  items: OrderItem[];
  history: OrderStatusHistoryEntry[];
  returns: OrderReturnRecord[];
  invoice: Invoice | null;
  payments: InvoicePayment[];
  creditNotes: CreditNote[];
  dispatchedWhatsAppUrl: string | null;
  templateWhatsAppUrls: OrderTemplateWhatsAppUrls;
} | null> {
  const supabase = createAdminSupabaseClient();

  const [
    { data: order, error: orderError },
    { data: items, error: itemsError },
    { data: history, error: historyError },
    { data: returns, error: returnsError },
    { data: invoice },
    { data: payments },
    { data: creditNotes },
    settings
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(ADMIN_ORDER_SELECT)
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("id, order_id, product_id, variant_id, variant_name, variant_sku, product_title, quantity, unit_price, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    supabase
      .from("order_status_history")
      .select("id, order_id, from_status, to_status, changed_by, reason, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    supabase
      .from("order_returns")
      .select("id, order_id, order_item_id, product_id, product_title, quantity, unit_price, refund_amount, condition, note, created_by, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    supabase.from("invoices").select("*").eq("order_id", orderId).maybeSingle(),
    supabase
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .order("paid_at", { ascending: true }),
    supabase
      .from("credit_notes")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    getStoreSettings()
  ]);

  if (orderError || !order || itemsError) return null;
  if (historyError) {
    logger.warn("Unable to load order_status_history", {
      orderId,
      error: historyError.message
    });
  }
  if (returnsError) {
    logger.warn("Unable to load order_returns", {
      orderId,
      error: returnsError.message
    });
  }

  const typedOrder = order as unknown as Order;
  const typedInvoice = (invoice as unknown as Invoice | null) ?? null;
  const typedPayments = (payments ?? []) as unknown as InvoicePayment[];
  const typedCreditNotes = (creditNotes ?? []) as unknown as CreditNote[];

  let deliveryZoneIsOutsideNairobi: boolean | null = null;
  if (typedOrder.delivery_zone_id) {
    try {
      const { data: zoneRow } = await supabase
        .from("delivery_zones")
        .select("is_outside_nairobi")
        .eq("id", typedOrder.delivery_zone_id)
        .maybeSingle();
      if (zoneRow && typeof (zoneRow as { is_outside_nairobi?: unknown }).is_outside_nairobi === "boolean") {
        deliveryZoneIsOutsideNairobi = (zoneRow as { is_outside_nairobi: boolean }).is_outside_nairobi;
      }
    } catch {
      // Ignore optional zone lookup errors
    }
  }

  const paidSum = typedPayments.reduce(
    (sum, payment) => sum + (Number(payment.amount ?? 0) || 0),
    0
  );
  const creditSum = typedCreditNotes.reduce(
    (sum, cn) => sum + (Number(cn.amount ?? 0) || 0),
    0
  );

  const enrichedOrder: Order = {
    ...typedOrder,
    amount_paid: Math.max(paidSum, Number(typedInvoice?.amount_paid ?? 0) || 0),
    credited_amount: Math.max(
      creditSum,
      Number(typedInvoice?.credited_amount ?? 0) || 0
    ),
    credit_note_count: typedCreditNotes.length,
    invoice_status: typedInvoice?.status ?? null,
    delivery_zone_is_outside_nairobi: deliveryZoneIsOutsideNairobi
  };

  let trackLink = `${SITE_URL}/track`;
  if (enrichedOrder.order_number?.trim()) {
    const cleanCode = enrichedOrder.order_number.trim().toUpperCase();
    try {
      const token = createOrderNumberToken(cleanCode);
      trackLink = `${SITE_URL}/order/${encodeURIComponent(cleanCode)}?t=${encodeURIComponent(token)}`;
    } catch {
      trackLink = `${SITE_URL}/track`;
    }
  }

  const invoiceLink =
    typedInvoice && isShareTokenActive(typedInvoice)
      ? `${SITE_URL}/i/${typedInvoice.share_token}`
      : trackLink;
  const reviewLink = `${trackLink}#review`;

  const templateWhatsAppUrls = buildOrderTemplateLinks({
    order: enrichedOrder,
    invoice: typedInvoice,
    templates: settings.message_templates,
    trackLink,
    invoiceLink,
    reviewLink
  });

  return {
    order: enrichedOrder,
    items: (items ?? []) as unknown as OrderItem[],
    history: (history ?? []) as unknown as OrderStatusHistoryEntry[],
    returns: (returns ?? []) as unknown as OrderReturnRecord[],
    invoice: typedInvoice,
    payments: typedPayments,
    creditNotes: typedCreditNotes,
    dispatchedWhatsAppUrl: templateWhatsAppUrls.dispatched,
    templateWhatsAppUrls
  };
}

export async function getOrderByNumber(
  orderNumber: string
): Promise<{ order: Order; items: OrderItem[] } | null> {
  const normalized = orderNumber.trim().toUpperCase();
  if (!normalized) return null;

  const supabase = createAdminSupabaseClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(ADMIN_ORDER_SELECT)
    .eq("order_number", normalized)
    .maybeSingle();

  if (orderError || !order) return null;

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id, order_id, product_id, product_title, quantity, unit_price, created_at")
    .eq("order_id", (order as unknown as { id: string }).id)
    .order("created_at", { ascending: true });

  if (itemsError) return null;

  return { order: order as unknown as Order, items: (items ?? []) as OrderItem[] };
}

type ListAdminOrdersParams = {
  status?: CanonicalOrderStatus | OrderStatus | "ALL" | "all";
  paymentStatus?: PaymentStatus | "ALL";
  testFilter?: "all" | "real" | "test";
  search?: string;
  from?: string;
  to?: string;
};

const LEGACY_STATUS_SET = new Set<string>([
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED"
]);

export async function listAdminOrders(
  params: ListAdminOrdersParams = {}
): Promise<Order[]> {
  const supabase = createAdminSupabaseClient();
  const search = params.search?.trim();

  let query = supabase
    .from("orders")
    .select(ADMIN_ORDER_SELECT)
    .order("created_at", { ascending: false });

  if (params.status && params.status !== "ALL" && params.status !== "all") {
    const canonical = LEGACY_STATUS_SET.has(params.status)
      ? mapLegacyStatusToCanonical(params.status as OrderStatus)
      : (params.status as CanonicalOrderStatus);
    query = query.eq("status", canonical);
  }

  if (params.paymentStatus && params.paymentStatus !== "ALL") {
    query = query.eq("payment_status", params.paymentStatus);
  }

  if (params.testFilter === "real") {
    query = query.eq("is_test", false);
  } else if (params.testFilter === "test") {
    query = query.eq("is_test", true);
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

  const orders = (data ?? []) as unknown as Order[];
  if (orders.length === 0) {
    return orders;
  }

  const summaryMap = await fetchOrderPaymentSummaryMap(
    supabase,
    orders.map(order => order.id)
  );

  return orders.map(order => {
    const summary = summaryMap.get(order.id);
    if (!summary) return order;
    return {
      ...order,
      amount_paid: summary.amount_paid,
      credited_amount: summary.credited_amount,
      credit_note_count: summary.credit_note_count,
      invoice_status: summary.invoice_status
    };
  });
}

export async function listProductStockMovements(productId: string): Promise<{
  product: Pick<Product, "id" | "title" | "stock_quantity">;
  movements: StockMovement[];
  ledgerSum: number;
  isConsistent: boolean;
} | null> {
  const supabase = createAdminSupabaseClient();
  const [
    { data: product, error: productError },
    { data: movements, error: movementsError }
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, title, stock_quantity")
      .eq("id", productId)
      .maybeSingle(),
    supabase
      .from("stock_movements")
      .select("id, product_id, variant_id, order_id, change, type, note, created_by, created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
  ]);

  if (productError || !product) return null;
  if (movementsError) throw new Error(movementsError.message);

  const rawMovements = (movements ?? []) as StockMovement[];
  const orderIds = Array.from(
    new Set(
      rawMovements
        .map(movement => movement.order_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const orderNumbersById = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: linkedOrders } = await supabase
      .from("orders")
      .select("id, order_number")
      .in("id", orderIds);

    for (const row of (linkedOrders ?? []) as Array<{ id: string; order_number: string | null }>) {
      orderNumbersById.set(
        row.id,
        row.order_number || `#${row.id.slice(0, 8).toUpperCase()}`
      );
    }
  }

  const enriched = rawMovements.map(movement => ({
    ...movement,
    order_number: movement.order_id
      ? (orderNumbersById.get(movement.order_id) ?? `#${movement.order_id.slice(0, 8).toUpperCase()}`)
      : null
  }));

  const typedProduct = product as Pick<Product, "id" | "title" | "stock_quantity">;
  const { data: variantRows } = await supabase
    .from("product_variants")
    .select("id, active")
    .eq("product_id", productId);
  const typedVariants = (variantRows ?? []) as Array<{ id: string; active: boolean }>;
  const hasVariants = typedVariants.length > 0;
  const activeVariantIds = new Set(
    typedVariants.filter(v => v.active).map(v => v.id)
  );
  const ledgerSum = hasVariants
    ? enriched
        .filter(movement => movement.variant_id && activeVariantIds.has(movement.variant_id))
        .reduce((sum, movement) => sum + Number(movement.change ?? 0), 0)
    : enriched
        .filter(movement => !movement.variant_id)
        .reduce((sum, movement) => sum + Number(movement.change ?? 0), 0);

  return {
    product: typedProduct,
    movements: enriched,
    ledgerSum,
    isConsistent: typedProduct.stock_quantity === ledgerSum
  };
}

export async function runStockIntegrityCheck(): Promise<{
  ok: boolean;
  totalProducts: number;
  discrepancies: StockIntegrityDiscrepancy[];
  checkedAt: string;
}> {
  const supabase = createAdminSupabaseClient();
  const [rpcRes, countRes] = await Promise.all([
    supabase.rpc("check_stock_integrity" as never),
    supabase.from("products").select("id", { count: "exact", head: true })
  ]);

  if (rpcRes.error) {
    throw new Error(rpcRes.error.message);
  }

  const discrepancies = ((rpcRes.data ?? []) as StockIntegrityDiscrepancy[]).map(row => ({
    product_id: String(row.product_id),
    product_title: String(row.product_title),
    recorded_stock: Number(row.recorded_stock),
    ledger_sum: Number(row.ledger_sum),
    discrepancy: Number(row.discrepancy)
  }));

  return {
    ok: discrepancies.length === 0,
    totalProducts: countRes.count ?? 0,
    discrepancies,
    checkedAt: new Date().toISOString()
  };
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const supabase = createAdminSupabaseClient();
  const [ordersResponse, itemsResponse, returnsResponse] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total, status, order_status, is_test, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("order_items")
      .select("order_id, product_title, quantity, unit_price"),
    supabase
      .from("order_returns")
      .select("order_id, product_title, quantity, refund_amount")
  ]);

  if (ordersResponse.error) {
    throw new Error(ordersResponse.error.message);
  }
  if (itemsResponse.error) {
    throw new Error(itemsResponse.error.message);
  }
  if (returnsResponse.error) {
    logger.warn("Unable to load order_returns for analytics", {
      error: returnsResponse.error.message
    });
  }

  // Revenue rule: cancelled and test orders NEVER count.
  const orders = ((ordersResponse.data ?? []) as Array<{
    id: string;
    total: string | number | null;
    status?: CanonicalOrderStatus | null;
    order_status: OrderStatus;
    is_test?: boolean | null;
    created_at: string;
  }>).filter(
    order => !order.is_test && resolveCanonicalOrderStatus(order) !== "cancelled"
  );

  const validOrderIds = new Set(orders.map(order => order.id));
  const items = ((itemsResponse.data ?? []) as Array<{
    order_id: string;
    product_title: string;
    quantity: number;
    unit_price: string | number;
  }>).filter(item => validOrderIds.has(item.order_id));

  const returns = ((returnsResponse.data ?? []) as Array<{
    order_id: string;
    product_title: string;
    quantity: number;
    refund_amount: string | number;
  }>).filter(ret => validOrderIds.has(ret.order_id));

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

  // Revenue rule: returns are subtracted when returned.
  for (const ret of returns) {
    const refund = Number(ret.refund_amount ?? 0);
    if (Number.isFinite(refund)) {
      revenue -= refund;
    }
  }
  revenue = Math.max(0, revenue);

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

  for (const ret of returns) {
    const current = productMap.get(ret.product_title);
    if (current) {
      current.quantity = Math.max(0, current.quantity - ret.quantity);
      current.revenue = Math.max(0, current.revenue - Number(ret.refund_amount ?? 0));
    }
  }

  const mostOrderedProducts = [...productMap.entries()]
    .filter(([, values]) => values.quantity > 0 || values.revenue > 0)
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

// ─── INVOICES, PAYMENTS, CREDIT NOTES & REPORTS (Phase 5) ──

export interface AdminInvoiceListItem extends Invoice {
  order_status_canonical: CanonicalOrderStatus | null;
  payment_methods: InvoicePaymentMethod[];
  mpesa_codes: string[];
}

export interface ListAdminInvoicesParams {
  status?: InvoiceStatus | "all";
  method?: InvoicePaymentMethod | "all";
  from?: string;
  to?: string;
  search?: string;
  outstandingOnly?: boolean;
}

export async function listAdminInvoices(
  params: ListAdminInvoicesParams = {}
): Promise<AdminInvoiceListItem[]> {
  const supabase = createAdminSupabaseClient();

  let query = supabase
    .from("invoices")
    .select("*")
    .order("issued_at", { ascending: false });

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }
  if (params.from) {
    query = query.gte("issued_at", `${params.from}T00:00:00.000+03:00`);
  }
  if (params.to) {
    query = query.lte("issued_at", `${params.to}T23:59:59.999+03:00`);
  }

  const [{ data: invoiceRows, error: invError }, { data: paymentRows }, { data: orderRows }] =
    await Promise.all([
      query,
      supabase
        .from("payments")
        .select("invoice_id, method, mpesa_code")
        .order("paid_at", { ascending: true }),
      supabase.from("orders").select("id, status, order_status")
    ]);

  if (invError) throw new Error(invError.message);

  const paymentsByInvoice = new Map<
    string,
    { methods: Set<InvoicePaymentMethod>; codes: string[] }
  >();
  for (const pay of (paymentRows ?? []) as Array<{
    invoice_id: string;
    method: InvoicePaymentMethod;
    mpesa_code: string | null;
  }>) {
    const entry = paymentsByInvoice.get(pay.invoice_id) ?? {
      methods: new Set<InvoicePaymentMethod>(),
      codes: []
    };
    entry.methods.add(pay.method);
    if (pay.mpesa_code) entry.codes.push(pay.mpesa_code);
    paymentsByInvoice.set(pay.invoice_id, entry);
  }

  const orderStatusById = new Map<string, CanonicalOrderStatus>();
  for (const ord of (orderRows ?? []) as Array<{
    id: string;
    status?: CanonicalOrderStatus | null;
    order_status: OrderStatus;
  }>) {
    orderStatusById.set(ord.id, resolveCanonicalOrderStatus(ord));
  }

  const normalizedSearch = params.search?.trim().toLowerCase() ?? "";

  let items: AdminInvoiceListItem[] = ((invoiceRows ?? []) as Invoice[]).map(inv => {
    const payMeta = paymentsByInvoice.get(inv.id);
    return {
      ...inv,
      order_status_canonical: orderStatusById.get(inv.order_id) ?? null,
      payment_methods: payMeta ? Array.from(payMeta.methods) : [],
      mpesa_codes: payMeta ? payMeta.codes : []
    };
  });

  if (params.outstandingOnly) {
    items = items.filter(
      item =>
        item.order_status_canonical === "delivered" &&
        (item.status === "unpaid" || item.status === "partially_paid")
    );
  }

  if (params.method && params.method !== "all") {
    items = items.filter(item => item.payment_methods.includes(params.method as InvoicePaymentMethod));
  }

  if (normalizedSearch) {
    items = items.filter(item => {
      const haystack = [
        item.invoice_number,
        item.customer_snapshot?.full_name,
        item.customer_snapshot?.phone,
        item.customer_snapshot?.order_number,
        item.etims_invoice_number,
        ...item.mpesa_codes
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }

  return items;
}

export async function getInvoiceDetailBundle(
  invoiceOrOrderId: string
): Promise<InvoiceDetailBundle | null> {
  const supabase = createAdminSupabaseClient();

  const { data: byId } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceOrOrderId)
    .maybeSingle();

  let invoice = (byId as Invoice | null) ?? null;

  if (!invoice) {
    const { data: byOrder } = await supabase
      .from("invoices")
      .select("*")
      .eq("order_id", invoiceOrOrderId)
      .maybeSingle();
    invoice = (byOrder as Invoice | null) ?? null;
  }

  if (!invoice) return null;

  const [{ data: payments }, { data: creditNotes }, { data: order }] = await Promise.all([
    supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("paid_at", { ascending: true }),
    supabase
      .from("credit_notes")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("orders")
      .select("id, order_number, status, order_status, created_at, rider_id, rider_name, rider_phone")
      .eq("id", invoice.order_id)
      .maybeSingle()
  ]);

  return {
    invoice,
    payments: (payments ?? []) as InvoicePayment[],
    creditNotes: (creditNotes ?? []) as CreditNote[],
    order: (order as InvoiceDetailBundle["order"]) ?? null
  };
}

export async function getInvoiceByShareToken(
  token: string
): Promise<InvoiceDetailBundle | null> {
  const cleanToken = token.trim();
  if (!cleanToken || cleanToken.length < 16) return null;

  const supabase = createAdminSupabaseClient();
  const { data: invoiceRow, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("share_token", cleanToken)
    .maybeSingle();

  if (error || !invoiceRow) return null;
  const invoice = invoiceRow as Invoice;

  if (!isShareTokenActive(invoice)) {
    return null;
  }

  const [{ data: payments }, { data: creditNotes }] = await Promise.all([
    supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("paid_at", { ascending: true }),
    supabase
      .from("credit_notes")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true })
  ]);

  return {
    invoice,
    payments: (payments ?? []) as InvoicePayment[],
    creditNotes: (creditNotes ?? []) as CreditNote[]
  };
}

export async function getDailyCashupReportData(
  dateIso: string
): Promise<DailyCashupReport> {
  const supabase = createAdminSupabaseClient();
  const [{ data: orders }, { data: invoices }, { data: payments }] = await Promise.all([
    supabase.from("orders").select(ADMIN_ORDER_SELECT),
    supabase.from("invoices").select("*"),
    supabase.from("payments").select("*").order("paid_at", { ascending: true })
  ]);

  return buildDailyCashupReport(
    dateIso,
    (orders ?? []) as unknown as Order[],
    (invoices ?? []) as Invoice[],
    (payments ?? []) as InvoicePayment[]
  );
}

export async function getMonthlySummaryReportData(monthIso: string): Promise<{
  report: MonthlySummaryReport;
  invoices: Invoice[];
  payments: InvoicePayment[];
  creditNotes: CreditNote[];
}> {
  const supabase = createAdminSupabaseClient();
  const [{ data: invoices }, { data: payments }, { data: creditNotes }] = await Promise.all([
    supabase.from("invoices").select("*").order("issued_at", { ascending: true }),
    supabase.from("payments").select("*").order("paid_at", { ascending: true }),
    supabase.from("credit_notes").select("*").order("created_at", { ascending: true })
  ]);

  const typedInvoices = (invoices ?? []) as Invoice[];
  const typedPayments = (payments ?? []) as InvoicePayment[];
  const typedCreditNotes = (creditNotes ?? []) as CreditNote[];

  return {
    report: buildMonthlySummaryReport(
      monthIso,
      typedInvoices,
      typedPayments,
      typedCreditNotes
    ),
    invoices: typedInvoices,
    payments: typedPayments,
    creditNotes: typedCreditNotes
  };
}

// ─── CUSTOMERS CRM (Phase 7) ─────────────────────────────

export type CustomerListFilter =
  | "all"
  | "opted_in"
  | "flagged"
  | "blocked"
  | "vip";

export async function listAdminCustomers(params?: {
  search?: string;
  filter?: CustomerListFilter;
}): Promise<Customer[]> {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("customers")
    .select("*")
    .order("last_order_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (params?.filter === "opted_in") {
    query = query
      .eq("marketing_opt_in", true)
      .eq("is_blocked", false)
      .is("anonymized_at", null);
  } else if (params?.filter === "flagged") {
    query = query.eq("is_flagged", true);
  } else if (params?.filter === "blocked") {
    query = query.eq("is_blocked", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let customers = (data ?? []) as Customer[];

  if (params?.filter === "vip") {
    customers = customers.filter(customer =>
      (customer.tags ?? []).some(tag => tag.toLowerCase() === "vip")
    );
  }

  const search = params?.search?.trim().toLowerCase();
  if (search) {
    customers = customers.filter(customer => {
      const haystack = [
        customer.full_name,
        customer.phone,
        customer.last_zone,
        customer.last_address,
        ...(customer.names_used ?? []),
        ...(customer.tags ?? [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  return customers;
}

export async function getCustomerDetailBundle(
  customerId: string
): Promise<CustomerDetailBundle | null> {
  const supabase = createAdminSupabaseClient();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();

  if (error || !customer) return null;

  const { data: orders } = await supabase
    .from("orders")
    .select(ADMIN_ORDER_SELECT)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  const typedOrders = (orders ?? []) as unknown as Order[];
  const orderIds = typedOrders.map(order => order.id);

  let invoices: Invoice[] = [];
  if (orderIds.length > 0) {
    const { data: invoiceRows } = await supabase
      .from("invoices")
      .select("*")
      .in("order_id", orderIds)
      .order("issued_at", { ascending: false });
    invoices = (invoiceRows ?? []) as Invoice[];
  }

  return {
    customer: customer as Customer,
    orders: typedOrders,
    invoices
  };
}

export async function listOptedInCustomers(): Promise<Customer[]> {
  return listAdminCustomers({ filter: "opted_in" });
}

// ─── PRODUCT VARIANTS & BACK-IN-STOCK ALERTS (Phase 8) ───

export async function listProductVariantsAdmin(
  productId: string,
  options: { includeCostPrice: boolean }
): Promise<ProductVariant[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select(options.includeCostPrice ? OWNER_VARIANT_SELECT : PUBLIC_VARIANT_SELECT)
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProductVariant[];
}

export async function listBackInStockAlerts(params?: {
  productId?: string;
  status?: BackInStockAlertStatus | "all";
  restockedOnly?: boolean;
}): Promise<BackInStockAlert[]> {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("back_in_stock_alerts")
    .select("id, product_id, variant_id, phone, customer_name, status, notified_at, notified_by, created_at")
    .order("created_at", { ascending: false });

  if (params?.productId) {
    query = query.eq("product_id", params.productId);
  }
  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rawAlerts = (data ?? []) as BackInStockAlert[];
  if (rawAlerts.length === 0) return [];

  const productIds = Array.from(new Set(rawAlerts.map(a => a.product_id)));
  const variantIds = Array.from(
    new Set(
      rawAlerts
        .map(a => a.variant_id)
        .filter((v): v is string => Boolean(v))
    )
  );

  const [{ data: productRows }, { data: variantRows }] = await Promise.all([
    supabase
      .from("products")
      .select("id, title, slug, price, stock_quantity")
      .in("id", productIds),
    variantIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, name, sku, price_override, stock_quantity")
          .in("id", variantIds)
      : Promise.resolve({ data: [] as unknown[] })
  ]);

  const productMap = new Map(
    ((productRows ?? []) as Array<{
      id: string;
      title: string;
      slug: string | null;
      price: string;
      stock_quantity: number;
    }>).map(p => [p.id, p])
  );

  const variantMap = new Map(
    ((variantRows ?? []) as Array<{
      id: string;
      name: string;
      sku: string;
      price_override: string | null;
      stock_quantity: number;
    }>).map(v => [v.id, v])
  );

  const enriched = rawAlerts.map(alert => {
    const product = productMap.get(alert.product_id);
    const variant = alert.variant_id ? variantMap.get(alert.variant_id) : undefined;
    return {
      ...alert,
      product_title: product?.title ?? "Product",
      product_slug: product?.slug ?? null,
      product_price: variant?.price_override ?? product?.price ?? undefined,
      product_stock: product?.stock_quantity ?? 0,
      variant_name: variant?.name ?? null,
      variant_sku: variant?.sku ?? null,
      variant_stock: variant ? variant.stock_quantity : null
    };
  });

  if (params?.restockedOnly) {
    return enriched.filter(alert => {
      const available =
        alert.variant_id != null
          ? (alert.variant_stock ?? 0)
          : (alert.product_stock ?? 0);
      return alert.status === "waiting" && available > 0;
    });
  }

  return enriched;
}

// ─── DELIVERY & RIDERS (Phase 9) ─────────────────────────

function normalizeRiderRow(row: Record<string, unknown>): Rider {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    active: Boolean(row.active ?? true),
    default_cost: Number(row.default_cost ?? 0),
    zone_costs: sanitizeZoneCosts(row.zone_costs),
    notes: typeof row.notes === "string" && row.notes.trim() ? row.notes : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? "")
  };
}

export async function listRiders(options?: {
  activeOnly?: boolean;
}): Promise<Rider[]> {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("riders")
    .select("id, name, phone, active, default_cost, zone_costs, notes, created_at, updated_at")
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (options?.activeOnly) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeRiderRow);
}

export async function getDispatchSheetReportData(
  dateIso: string,
  options?: { riderId?: string | null; includeConfirmed?: boolean }
): Promise<DispatchSheetReport> {
  const supabase = createAdminSupabaseClient();
  const [{ data: orders, error: ordersError }, { data: items }, { data: invoices }] =
    await Promise.all([
      supabase
        .from("orders")
        .select(ADMIN_ORDER_SELECT)
        .order("created_at", { ascending: false }),
      supabase
        .from("order_items")
        .select(
          "id, order_id, product_id, variant_id, variant_name, variant_sku, product_title, quantity, unit_price, created_at"
        )
        .order("created_at", { ascending: true }),
      supabase.from("invoices").select("*")
    ]);

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  return buildDispatchSheetReport(
    dateIso,
    (orders ?? []) as unknown as Order[],
    (items ?? []) as unknown as OrderItem[],
    (invoices ?? []) as unknown as Invoice[],
    options
  );
}

export async function getDeliveryMarginReportData(
  fromIso: string,
  toIso: string
): Promise<DeliveryMarginReport> {
  const supabase = createAdminSupabaseClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select(ADMIN_ORDER_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return buildDeliveryMarginReport(
    fromIso,
    toIso,
    (orders ?? []) as unknown as Order[]
  );
}

// ─── NOTIFICATIONS & DAILY SUMMARY (Phase 10) ────────────

export async function listAdminPushSubscriptions(
  userId?: string
): Promise<AdminPushSubscription[]> {
  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("admin_push_subscriptions")
    .select(
      "id, user_id, user_email, endpoint, p256dh, auth, user_agent, active, last_used_at, created_at, updated_at"
    )
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as AdminPushSubscription[];
}

export async function countActiveAdminPushSubscriptions(): Promise<number> {
  const supabase = createAdminSupabaseClient();
  const { count, error } = await supabase
    .from("admin_push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("active", true);

  if (error) {
    logger.warn("Unable to count active admin push subscriptions", {
      error: error.message
    });
    return 0;
  }

  return count ?? 0;
}

export async function getDailySummaryReportData(
  dateIso: string
): Promise<DailySummaryReport> {
  const supabase = createAdminSupabaseClient();
  const [
    settings,
    { data: orders, error: ordersError },
    { data: invoices },
    { data: payments },
    { data: returns },
    { data: products },
    { data: variants }
  ] = await Promise.all([
    getStoreSettings(),
    supabase.from("orders").select(ADMIN_ORDER_SELECT),
    supabase.from("invoices").select("*"),
    supabase.from("payments").select("*").order("paid_at", { ascending: true }),
    supabase
      .from("order_returns")
      .select(
        "id, order_id, order_item_id, product_id, product_title, quantity, unit_price, refund_amount, condition, note, created_by, created_at"
      ),
    supabase.from("products").select("id, title, stock_quantity, status, active"),
    supabase
      .from("product_variants")
      .select("id, product_id, name, stock_quantity, active")
  ]);

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  return buildDailySummaryReport(dateIso, {
    orders: (orders ?? []) as unknown as Order[],
    invoices: (invoices ?? []) as unknown as Invoice[],
    payments: (payments ?? []) as unknown as InvoicePayment[],
    returns: (returns ?? []) as unknown as OrderReturnRecord[],
    products: (products ?? []) as unknown as Pick<
      Product,
      "id" | "title" | "stock_quantity" | "status" | "active"
    >[],
    variants: (variants ?? []) as unknown as Pick<
      ProductVariant,
      "id" | "product_id" | "name" | "stock_quantity" | "active"
    >[],
    lowStockThreshold: settings.low_stock_default
  });
}

// ─── POSTGRES ANALYTICS DASHBOARD (Phase 11) ─────────────

export async function getAnalyticsDashboardData(params: {
  from: string;
  to: string;
  includeOwnerMetrics: boolean;
  includeInternal?: boolean;
}): Promise<AnalyticsDashboardReport> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc("get_analytics_dashboard" as never, {
    p_from: params.from,
    p_to: params.to,
    p_include_owner_metrics: params.includeOwnerMetrics,
    p_include_internal: Boolean(params.includeInternal)
  } as never);

  if (error) {
    logger.error("get_analytics_dashboard RPC failed", {
      error: error.message,
      from: params.from,
      to: params.to
    });
    return buildEmptyAnalyticsDashboardReport(
      params.from,
      params.to,
      params.includeOwnerMetrics
    );
  }

  if (!data || typeof data !== "object") {
    return buildEmptyAnalyticsDashboardReport(
      params.from,
      params.to,
      params.includeOwnerMetrics
    );
  }

  const report = data as unknown as AnalyticsDashboardReport;
  if (Array.isArray(report.recent_orders) && report.recent_orders.length > 0) {
    const summaryMap = await fetchOrderPaymentSummaryMap(
      supabase,
      report.recent_orders.map(order => order.id)
    );
    if (summaryMap.size > 0) {
      report.recent_orders = report.recent_orders.map(order => {
        const summary = summaryMap.get(order.id);
        if (!summary) return order;
        return {
          ...order,
          amount_paid: summary.amount_paid,
          credited_amount: summary.credited_amount,
          credit_note_count: summary.credit_note_count,
          invoice_status: summary.invoice_status
        };
      });
    }
  }

  return report;
}

export async function getOwnerSetupChecklistData(params: {
  alertsConfigured: boolean;
  ownerMfaEnabled: boolean;
}): Promise<SetupChecklistSummary> {
  const supabase = createAdminSupabaseClient();

  const [
    ridersRes,
    activeProductsRes,
    zoneAuditRes,
    zonesRes,
    settings
  ] = await Promise.all([
    supabase
      .from("riders")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("products")
      .select(`${PUBLIC_PRODUCT_SELECT}, cost_price`)
      .eq("status", "active")
      .eq("active", true),
    supabase
      .from("audit_log")
      .select("id")
      .eq("entity", "delivery_zone")
      .limit(1),
    supabase
      .from("delivery_zones")
      .select("created_at, updated_at"),
    getStoreSettings()
  ]);

  const activeProducts = (activeProductsRes.data ?? []) as unknown as Product[];
  const activeProductsMissingCostCount = activeProducts.filter(
    product =>
      product.cost_price === null ||
      product.cost_price === undefined ||
      String(product.cost_price).trim() === ""
  ).length;
  const catalogWarnings = getCatalogQualityWarnings(activeProducts);
  const catalogWarningsProductCount =
    countUniqueProductsWithCatalogWarnings(catalogWarnings);

  const hasZoneAuditEntry = Array.isArray(zoneAuditRes.data) && zoneAuditRes.data.length > 0;
  const hasEditedZoneTimestamp = (
    (zonesRes.data ?? []) as Array<{ created_at?: string; updated_at?: string }>
  ).some(zone => {
    if (!zone.created_at || !zone.updated_at) return false;
    const createdMs = Date.parse(zone.created_at);
    const updatedMs = Date.parse(zone.updated_at);
    return Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs - createdMs >= 1000;
  });

  return buildSetupChecklist({
    alertsConfigured: params.alertsConfigured,
    activeRidersCount: ridersRes.count ?? 0,
    activeProductsCount: activeProducts.length,
    activeProductsMissingCostCount,
    catalogWarningsProductCount,
    deliveryFeesReviewed: hasZoneAuditEntry || hasEditedZoneTimestamp,
    legalReviewedAt: settings.legal_reviewed_at ?? null,
    ownerMfaEnabled: params.ownerMfaEnabled
  });
}

// ─── REAL VERIFIED REVIEWS (Phase 12) ────────────────────

async function fetchApprovedProductReviewsUncached(
  productId: string
): Promise<PublicProductReview[]> {
  if (!hasPublicSupabaseEnv() || !hasUsableServiceRoleKey()) {
    return [];
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, product_id, customer_name, rating, comment, photo_url, created_at")
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    (data ?? []) as Array<{
      id: string;
      product_id: string;
      customer_name: string;
      rating: number;
      comment: string;
      photo_url: string | null;
      created_at: string;
    }>
  ).map(row => ({
    id: row.id,
    product_id: row.product_id,
    display_name: formatReviewerDisplayName(row.customer_name),
    rating: Number(row.rating),
    comment: row.comment,
    photo_url: row.photo_url ?? null,
    created_at: row.created_at
  }));
}

export async function listApprovedProductReviews(
  productId: string
): Promise<PublicProductReview[]> {
  if (!hasPublicSupabaseEnv() || !hasUsableServiceRoleKey()) {
    return [];
  }
  try {
    return await unstable_cache(
      () => fetchApprovedProductReviewsUncached(productId),
      ["approved-product-reviews", productId],
      {
        tags: ["reviews"],
        revalidate: 300
      }
    )();
  } catch (err) {
    logger.warn("Unable to load approved product reviews", {
      productId,
      error: err instanceof Error ? err.message : String(err)
    });
    return [];
  }
}

export type VerifyOrderForReviewResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      matchedPhone: string;
      reviewerDisplayName: string;
      items: Array<{
        productId: string;
        title: string;
        variantName: string | null;
        alreadyReviewed: boolean;
      }>;
    }
  | {
      ok: false;
      reason: "not_found" | "not_delivered";
      message: string;
    };

export async function verifyDeliveredOrderForReview(
  orderNumber: string,
  normalizedPhone: string
): Promise<VerifyOrderForReviewResult> {
  const cleanOrderNumber = orderNumber.trim().toUpperCase();
  const record = await getOrderByNumber(cleanOrderNumber);

  if (!record) {
    return {
      ok: false,
      reason: "not_found",
      message: "No order found matching that order number and phone number."
    };
  }

  let storedNormalized = record.order.customer_phone.trim();
  try {
    storedNormalized = normalizeKenyanPhoneNumber(record.order.customer_phone);
  } catch {
    // Keep stored string if non-standard legacy format
  }

  if (storedNormalized !== normalizedPhone) {
    return {
      ok: false,
      reason: "not_found",
      message: "No order found matching that order number and phone number."
    };
  }

  const canonicalStatus = resolveCanonicalOrderStatus(record.order);
  if (canonicalStatus !== "delivered") {
    return {
      ok: false,
      reason: "not_delivered",
      message: "Reviews can only be submitted after your order has been delivered."
    };
  }

  const supabase = createAdminSupabaseClient();
  const { data: existingReviews } = await supabase
    .from("reviews")
    .select("product_id")
    .eq("order_id", record.order.id);

  const reviewedProductIds = new Set(
    ((existingReviews ?? []) as Array<{ product_id: string }>).map(r => r.product_id)
  );

  const uniqueItems = new Map<
    string,
    {
      productId: string;
      title: string;
      variantName: string | null;
      alreadyReviewed: boolean;
    }
  >();

  for (const item of record.items) {
    if (!item.product_id || uniqueItems.has(item.product_id)) continue;
    uniqueItems.set(item.product_id, {
      productId: item.product_id,
      title: item.product_title,
      variantName: item.variant_name ?? null,
      alreadyReviewed: reviewedProductIds.has(item.product_id)
    });
  }

  return {
    ok: true,
    orderId: record.order.id,
    orderNumber: record.order.order_number || cleanOrderNumber,
    matchedPhone: record.order.customer_phone,
    reviewerDisplayName: formatReviewerDisplayName(record.order.customer_name),
    items: Array.from(uniqueItems.values())
  };
}

export async function listAdminReviews(
  statusFilter: ReviewStatus | "all" = "all"
): Promise<{
  reviews: AdminReviewRecord[];
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
}> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, product_id, order_id, order_number, customer_name, customer_phone, rating, comment, photo_url, status, moderated_by, moderated_at, moderation_note, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    product_id: string;
    order_id: string;
    order_number: string;
    customer_name: string;
    customer_phone: string;
    rating: number;
    comment: string;
    photo_url: string | null;
    status: ReviewStatus;
    moderated_by: string | null;
    moderated_at: string | null;
    moderation_note: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    total: rows.length
  };

  for (const row of rows) {
    if (row.status === "pending") counts.pending += 1;
    else if (row.status === "approved") counts.approved += 1;
    else if (row.status === "rejected") counts.rejected += 1;
  }

  const filtered =
    statusFilter === "all"
      ? rows
      : rows.filter(row => row.status === statusFilter);

  if (filtered.length === 0) {
    return { reviews: [], counts };
  }

  const productIds = Array.from(new Set(filtered.map(row => row.product_id)));
  const { data: productRows } = await supabase
    .from("products")
    .select("id, title, slug")
    .in("id", productIds);

  const productMap = new Map(
    ((productRows ?? []) as Array<{ id: string; title: string; slug: string | null }>).map(
      product => [product.id, product]
    )
  );

  const reviews: AdminReviewRecord[] = filtered.map(row => {
    const product = productMap.get(row.product_id);
    return {
      ...row,
      rating: Number(row.rating),
      product_title: product?.title ?? "Product",
      product_slug: product?.slug ?? null
    };
  });

  return { reviews, counts };
}
