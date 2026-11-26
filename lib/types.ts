// =========================================================
// Auro Ardon – Final TypeScript Types
// ALWAYS matches Supabase column names exactly
// =========================================================

// ─── Enums ───────────────────────────────────────────────

export type OrderStatus =
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";
export type PaymentMethod = "CASH_ON_DELIVERY" | "WHATSAPP";
export type PaymentStatus = "PENDING" | "PAID";

// ─── Category ────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  display_order: number;
  active?: boolean;
  created_at: string;
}

// ─── Product & Variants ──────────────────────────────────

export type ProductStatus = "draft" | "active" | "archived";

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  option_values: Record<string, string>;
  sku: string;
  price_override: string | null;
  compare_at_price?: string | null;
  cost_price?: string | null; // Owner-only; never exposed on storefront or to staff
  stock_quantity: number;
  image_url: string | null;
  image_alt: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  title: string;           // DB column: title
  slug: string | null;
  description: string;
  category: string;        // human-readable category name (denormalized)
  category_id: string | null;
  price: string;
  compare_at_price?: string | null;
  cost_price?: string | null; // Owner-only; never exposed on storefront or to staff
  stock_quantity: number;  // DB column: stock_quantity
  low_stock_threshold?: number | null;
  material: string | null;
  finish?: string | null;
  size_label?: string | null;
  water_resistance?: string | null;
  warranty?: string | null;
  ingredients?: string | null;
  net_weight?: string | null;
  expiry_info?: string | null;
  in_the_box?: string | null;
  care?: string | null;
  images: string[];
  image_alts?: string[];
  is_featured: boolean;   // DB column: is_featured
  featured_order?: number;
  is_new_in?: boolean;
  new_in_order?: number;
  active: boolean;        // Synced with status === 'active'
  status?: ProductStatus;
  blur_data_url?: string | null;
  variants?: ProductVariant[];
  review_rating_avg?: number | null;
  review_count?: number;
  created_at: string;
}

export interface RedirectRecord {
  id: string;
  from_path: string;
  to_path: string;
  status_code: number;
  entity_type: "product" | "category" | "custom";
  entity_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type BackInStockAlertStatus = "waiting" | "notified" | "cancelled";

export interface BackInStockAlert {
  id: string;
  product_id: string;
  variant_id: string | null;
  phone: string;
  customer_name: string | null;
  status: BackInStockAlertStatus;
  notified_at: string | null;
  notified_by: string | null;
  created_at: string;
  product_title?: string;
  product_slug?: string | null;
  product_price?: string;
  product_stock?: number;
  variant_name?: string | null;
  variant_sku?: string | null;
  variant_stock?: number | null;
}

// ─── Cart ────────────────────────────────────────────────

export interface CartItem {
  product: Product;
  variant?: ProductVariant | null;
  quantity: number;
}

// ─── Order ───────────────────────────────────────────────
// Fields: id, customer_name, customer_email, customer_phone,
//         customer_location, notes, payment_method, payment_status,
//         order_status, subtotal, shipping_fee, total, created_at

export type CanonicalOrderStatus =
  | "pending"
  | "confirmed"
  | "dispatched"
  | "delivered"
  | "cancelled"
  | "returned";

export type OrderCancelReason =
  | "customer_no_response"
  | "customer_cancelled"
  | "out_of_stock"
  | "fake_order"
  | "delivery_failed"
  | "other";

export type OrderReturnCondition = "resellable" | "damaged";

export type StockMovementType =
  | "initial_stock"
  | "order_reserved"
  | "cancel_restock"
  | "return_restock"
  | "manual_adjustment"
  | "damaged_writeoff";

export interface Order {
  id: string;
  order_number?: string | null;
  channel?: string | null;
  status?: CanonicalOrderStatus | null;
  customer_id?: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  customer_location: string;
  delivery_zone_id?: string | null;
  delivery_zone_name?: string | null;
  delivery_address?: string | null;
  town_county?: string | null;
  notes: string | null;
  is_gift?: boolean;
  gift_note?: string | null;
  hide_prices?: boolean;
  marketing_opt_in?: boolean;
  discount_code?: string | null;
  discount_amount?: string | number | null;
  cancel_reason?: OrderCancelReason | null;
  cancel_note?: string | null;
  cancelled_at?: string | null;
  restocked_at?: string | null;
  returned_at?: string | null;
  needs_review?: boolean;
  review_reason?: string | null;
  rider_id?: string | null;
  rider_name?: string | null;
  rider_phone?: string | null;
  rider_cost?: string | number | null;
  dispatched_at?: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  subtotal: string;
  shipping_fee: string;
  total: string;
  created_at: string;
}

export interface OrderStatusHistoryEntry {
  id: string;
  order_id: string;
  from_status: CanonicalOrderStatus | null;
  to_status: CanonicalOrderStatus;
  changed_by: string;
  reason: string | null;
  created_at: string;
}

export interface OrderReturnRecord {
  id: string;
  order_id: string;
  order_item_id: string | null;
  product_id: string | null;
  product_title: string;
  quantity: number;
  unit_price: string;
  refund_amount: string;
  condition: OrderReturnCondition;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  variant_id?: string | null;
  order_id: string | null;
  order_number?: string | null;
  change: number;
  type: StockMovementType;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface StockIntegrityDiscrepancy {
  product_id: string;
  product_title: string;
  recorded_stock: number;
  ledger_sum: number;
  discrepancy: number;
}

// ─── Invoices, Payments & Credit Notes (Phase 5) ─────────

export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "void";
export type InvoicePaymentMethod = "cash" | "mpesa";

export interface InvoiceCustomerSnapshot {
  full_name: string;
  phone: string;
  address: string;
  delivery_zone_name?: string | null;
  town_county?: string | null;
  location?: string | null;
  order_number?: string | null;
  is_gift?: boolean;
  hide_prices?: boolean;
}

export interface InvoiceLineSnapshot {
  order_item_id?: string | null;
  product_id?: string | null;
  name: string;
  sku: string;
  qty: number;
  unit_price: number | string;
  line_total: number | string;
}

export interface InvoiceBusinessSnapshot {
  site_name: string;
  business_phone: string;
  business_email?: string | null;
  business_address: string;
  kra_pin?: string | null;
  logo_url?: string | null;
  currency?: string;
  business_hours?: string;
  invoice_footer?: string;
  payment_instructions?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  status: InvoiceStatus;
  issued_at: string;
  due_at: string;
  etims_invoice_number: string | null;
  share_token: string;
  share_expires_at: string;
  share_revoked: boolean;
  customer_snapshot: InvoiceCustomerSnapshot;
  lines_snapshot: InvoiceLineSnapshot[];
  business_snapshot: InvoiceBusinessSnapshot;
  subtotal: string;
  discount_code: string | null;
  discount_amount: string;
  delivery_fee: string;
  total: string;
  amount_paid: string;
  credited_amount: string;
  pdf_a4_path: string | null;
  pdf_receipt_path: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  order_id: string;
  amount: string;
  method: InvoicePaymentMethod;
  mpesa_code: string | null;
  received_by: string;
  paid_at: string;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface CreditNoteLine {
  order_item_id?: string | null;
  name: string;
  sku?: string | null;
  qty: number;
  unit_price: number | string;
  line_total: number | string;
  condition?: string | null;
}

export interface CreditNote {
  id: string;
  credit_note_number: string;
  invoice_id: string;
  order_id: string;
  reason: string;
  lines: CreditNoteLine[];
  amount: string;
  created_by: string;
  created_at: string;
}

export interface InvoiceDetailBundle {
  invoice: Invoice;
  payments: InvoicePayment[];
  creditNotes: CreditNote[];
  order?: Pick<
    Order,
    | "id"
    | "order_number"
    | "status"
    | "order_status"
    | "created_at"
    | "rider_id"
    | "rider_name"
    | "rider_phone"
  > | null;
}

export interface RiderCashupSummary {
  receivedBy: string;
  riderId?: string | null;
  riderPhone?: string | null;
  expectedTotal: number;
  deliveryCount: number;
  riderCostTotal: number;
  cashTotal: number;
  mpesaTotal: number;
  totalCollected: number;
  difference: number;
  paymentCount: number;
  mpesaCodes: string[];
}

export interface DailyCashupReport {
  date: string;
  expectedTotal: number;
  collectedTotal: number;
  difference: number;
  cashTotal: number;
  mpesaTotal: number;
  totalRiderCost: number;
  expectedInvoiceCount: number;
  paymentCount: number;
  mpesaPayments: Array<{
    paymentId: string;
    invoiceNumber: string;
    mpesaCode: string;
    amount: number;
    receivedBy: string;
    paidAt: string;
  }>;
  byRider: RiderCashupSummary[];
}

export interface MonthlySummaryReport {
  month: string;
  invoiceCount: number;
  creditNoteCount: number;
  paymentCount: number;
  grossSales: number;
  discounts: number;
  deliveryFees: number;
  creditNotesTotal: number;
  netSales: number;
  cashCollected: number;
  mpesaCollected: number;
  totalCollected: number;
}

// ─── Discounts & Promotions (Phase 6) ────────────────────

export type DiscountCodeType = "percent" | "fixed" | "free_delivery";

export interface DiscountCode {
  id: string;
  code: string;
  description: string | null;
  type: DiscountCodeType;
  value: string;
  min_order_amount: string;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_phone_limit: number | null;
  first_order_only: boolean;
  used_count: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type DiscountCodeInsert = Omit<
  DiscountCode,
  "id" | "used_count" | "created_at" | "updated_at"
> & {
  id?: string;
};

export type DiscountCodeUpdate = Partial<
  Omit<DiscountCode, "id" | "used_count" | "created_at" | "updated_at">
>;

// ─── Customers CRM (Phase 7) ─────────────────────────────

export interface Customer {
  id: string;
  phone: string;
  full_name: string;
  names_used: string[];
  last_zone: string | null;
  last_address: string | null;
  zones_used: string[];
  addresses_used: string[];
  order_count: number;
  lifetime_value: string;
  cancelled_count: number;
  is_flagged: boolean;
  is_blocked: boolean;
  marketing_opt_in: boolean;
  marketing_opt_in_at: string | null;
  notes: string | null;
  tags: string[];
  first_order_at: string | null;
  last_order_at: string | null;
  anonymized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerDetailBundle {
  customer: Customer;
  orders: Order[];
  invoices: Invoice[];
}

// ─── Delivery & Riders (Phase 9) ─────────────────────────

export interface Rider {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  default_cost: number;
  zone_costs: Record<string, number>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type RiderInsert = Omit<Rider, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export type RiderUpdate = Partial<Omit<Rider, "id" | "created_at" | "updated_at">>;

export interface DispatchSheetItemSummary {
  title: string;
  variant_name?: string | null;
  quantity: number;
}

export interface DispatchSheetRow {
  orderId: string;
  orderNumber: string;
  status: CanonicalOrderStatus;
  customerName: string;
  customerPhone: string;
  deliveryZoneName: string;
  address: string;
  townCounty: string | null;
  items: DispatchSheetItemSummary[];
  itemsSummary: string;
  totalUnits: number;
  orderTotal: number;
  amountToCollect: number;
  riderId: string | null;
  riderName: string;
  riderPhone: string | null;
  riderCost: number | null;
  dispatchedAt: string | null;
  notes: string | null;
  isGift: boolean;
  hidePrices: boolean;
}

export interface DispatchSheetRiderGroup {
  riderKey: string;
  riderId: string | null;
  riderName: string;
  riderPhone: string | null;
  orderCount: number;
  totalToCollect: number;
  totalRiderCost: number;
  rows: DispatchSheetRow[];
}

export interface DispatchSheetReport {
  date: string;
  totalOrders: number;
  totalAmountToCollect: number;
  totalRiderCost: number;
  rows: DispatchSheetRow[];
  byRider: DispatchSheetRiderGroup[];
}

export interface DeliveryMarginZoneRow {
  zoneName: string;
  orderCount: number;
  feesCharged: number;
  riderCosts: number;
  margin: number;
  marginPercent: number | null;
}

export interface DeliveryMarginRiderRow {
  riderId: string | null;
  riderName: string;
  riderPhone: string | null;
  orderCount: number;
  feesCharged: number;
  riderCosts: number;
  margin: number;
  marginPercent: number | null;
}

export interface DeliveryMarginOrderRow {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  dispatchedAt: string | null;
  status: CanonicalOrderStatus;
  customerName: string;
  zoneName: string;
  riderName: string;
  deliveryFeeCharged: number;
  riderCost: number;
  margin: number;
}

export interface DeliveryMarginReport {
  from: string;
  to: string;
  orderCount: number;
  ordersWithRiderCost: number;
  ordersMissingRiderCost: number;
  totalFeesCharged: number;
  totalRiderCosts: number;
  netMargin: number;
  marginPercent: number | null;
  byZone: DeliveryMarginZoneRow[];
  byRider: DeliveryMarginRiderRow[];
  orders: DeliveryMarginOrderRow[];
}

// ─── OrderItem ───────────────────────────────────────────
// Fields: id, order_id, product_id, product_title, quantity, unit_price, created_at

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id?: string | null;
  variant_name?: string | null;
  variant_sku?: string | null;
  product_title: string;
  quantity: number;
  unit_price: string;
  created_at: string;
}

export type CategoryInsert = Omit<Category, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type CategoryUpdate = Partial<Omit<Category, "id" | "created_at">>;

export type ProductInsert = Omit<Product, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type ProductUpdate = Partial<Omit<Product, "id" | "created_at">>;

export type OrderInsert = Omit<Order, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type OrderUpdate = Partial<Omit<Order, "id" | "created_at">>;

export type OrderItemInsert = Omit<OrderItem, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type OrderItemUpdate = Partial<Omit<OrderItem, "id" | "created_at">>;

export interface AdminAnalyticsSeriesPoint {
  label: string;
  value: number;
}

export interface AdminTopProduct {
  product_title: string;
  quantity: number;
  revenue: number;
}

export interface AdminAnalytics {
  totalOrders: number;
  ordersToday: number;
  revenue: number;
  mostOrderedProducts: AdminTopProduct[];
  ordersPerDay: AdminAnalyticsSeriesPoint[];
  topProductsChart: AdminAnalyticsSeriesPoint[];
}

// ─── Store Settings & Delivery Zones (Phase 0) ───────────

export interface StoreMessageTemplates {
  confirmed: string;
  dispatched: string;
  delivered: string;
  cancelled: string;
  unpaid_reminder: string;
  back_in_stock: string;
}

export interface StoreSettings {
  id: boolean;
  site_name: string;
  business_phone: string;
  business_email: string | null;
  business_address: string;
  kra_pin: string | null;
  logo_url: string | null;
  whatsapp_number: string;
  currency: string;
  timezone: string;
  business_hours: string;
  same_day_cutoff: string;
  pending_auto_cancel_hours: number;
  low_stock_default: number;
  free_delivery_threshold: number;
  instagram_url: string;
  tiktok_url: string;
  is_store_open: boolean;
  holiday_banner_message: string;
  invoice_footer: string;
  payment_instructions: string;
  message_templates: StoreMessageTemplates;
  sms_notifications_enabled: boolean;
  updated_at: string;
}

export interface AdminPushSubscription {
  id: string;
  user_id: string;
  user_email: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  active: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderTemplateWhatsAppUrls {
  confirmed: string | null;
  dispatched: string | null;
  delivered: string | null;
  cancelled: string | null;
  unpaid_reminder: string | null;
}

export interface DailySummaryLowStockItem {
  productId: string;
  variantId: string | null;
  title: string;
  stockQuantity: number;
}

export interface DailySummaryReport {
  date: string;
  ordersTodayCount: number;
  ordersTodayByStatus: {
    pending: number;
    confirmed: number;
    dispatched: number;
    delivered: number;
    cancelled: number;
    returned: number;
  };
  bookedRevenue: number;
  collectedRevenue: number;
  collectedCash: number;
  collectedMpesa: number;
  pendingOrdersCount: number;
  pendingOrdersTotal: number;
  overduePending24hCount: number;
  lowStockThreshold: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockItems: DailySummaryLowStockItem[];
  cashStillToCollectCount: number;
  cashStillToCollectTotal: number;
}

// ─── Analytics Dashboard & Privacy-Friendly Events (Phase 11) ─

export type StorefrontEventName =
  | "product_view"
  | "add_to_bag"
  | "begin_checkout"
  | "whatsapp_order_sent"
  | "whatsapp_product_question";

export type AnalyticsDatePreset =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "this_month"
  | "custom";

export interface AnalyticsDiscountCodeRow {
  code: string;
  uses: number;
  discount_total: number;
  revenue_total: number;
}

export interface AnalyticsPeriodKpis {
  booked_revenue: number;
  collected_revenue: number;
  delivery_fees_collected: number;
  delivery_rider_costs: number;
  delivery_margin: number;
  gross_profit: number | null;
  gross_margin_pct: number | null;
  items_missing_cost: number | null;
  orders_total: number;
  orders_active: number;
  orders_by_status: {
    pending: number;
    confirmed: number;
    dispatched: number;
    delivered: number;
    cancelled: number;
    returned: number;
  };
  aov: number;
  confirmation_rate: number;
  cancellation_rate: number;
  return_rate: number;
  avg_hours_to_confirm: number | null;
  avg_hours_to_deliver: number | null;
  new_customers: number;
  returning_customers: number;
  discounts_given: number;
  discounts_by_code: AnalyticsDiscountCodeRow[];
}

export interface AnalyticsRevenueSeriesPoint {
  bucket: string;
  label: string;
  orders: number;
  cancelled_orders: number;
  booked_revenue: number;
  collected_revenue: number;
}

export interface AnalyticsFunnel {
  product_views: number;
  add_to_bag: number;
  begin_checkout: number;
  whatsapp_order_sent: number;
  confirmed: number;
  delivered: number;
  whatsapp_questions: number;
}

export interface AnalyticsTopProductRow {
  product_id: string | null;
  title: string;
  category: string;
  units: number;
  revenue: number;
  profit: number | null;
  margin_pct: number | null;
}

export interface AnalyticsCategoryRow {
  category: string;
  orders: number;
  units: number;
  revenue: number;
}

export interface AnalyticsZoneRow {
  zone: string;
  orders: number;
  revenue: number;
  delivery_fees: number;
  rider_costs: number;
  delivery_margin: number;
}

export interface AnalyticsHeatmapCell {
  dow: number; // 0 = Mon .. 6 = Sun (EAT)
  hour: number; // 0 .. 23 (EAT)
  orders: number;
  revenue: number;
}

export interface AnalyticsCancelReasonRow {
  reason: string;
  count: number;
  lost_value: number;
}

export interface AnalyticsStatusRow {
  status: CanonicalOrderStatus;
  count: number;
  total: number;
}

export interface AnalyticsInventoryStockItem {
  id: string;
  title: string;
  category: string;
  stock_quantity: number;
  threshold: number;
  price: number;
  units_30d: number;
}

export interface AnalyticsBestSellerRiskItem {
  id: string;
  title: string;
  category: string;
  stock_quantity: number;
  units_30d: number;
  daily_rate: number;
  days_of_stock: number;
}

export interface AnalyticsDeadStockItem {
  id: string;
  title: string;
  category: string;
  stock_quantity: number;
  retail_value: number;
  cost_value: number | null;
  last_sale_at: string | null;
}

export interface AnalyticsSellThroughItem {
  id: string;
  title: string;
  category: string;
  units_sold: number;
  current_stock: number;
  revenue: number;
  sell_through_pct: number;
}

export interface AnalyticsInventoryTracker {
  default_low_stock_threshold: number;
  stock_value: {
    total_units: number;
    active_products: number;
    retail_value: number;
    cost_value: number | null;
    products_missing_cost: number | null;
  };
  out_of_stock: AnalyticsInventoryStockItem[];
  low_stock: AnalyticsInventoryStockItem[];
  best_sellers_at_risk: AnalyticsBestSellerRiskItem[];
  dead_stock: AnalyticsDeadStockItem[];
  sell_through: AnalyticsSellThroughItem[];
}

export interface AnalyticsNeedsAttention {
  pending_over_24h_count: number;
  pending_over_24h: Array<{
    id: string;
    order_number: string;
    customer_name: string;
    total: number;
    created_at: string;
  }>;
  out_of_stock_best_sellers_count: number;
  out_of_stock_best_sellers: Array<{
    id: string;
    title: string;
    units_30d: number;
  }>;
  dispatched_over_3d_count: number;
  dispatched_over_3d: Array<{
    id: string;
    order_number: string;
    customer_name: string;
    rider_name: string | null;
    dispatched_at: string;
  }>;
  unpaid_delivered_invoices_count: number;
  unpaid_delivered_invoices_total: number;
  unpaid_delivered_invoices: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    balance_due: number;
  }>;
  reviews_pending_moderation_count: number;
}

export interface AnalyticsRecentOrder {
  id: string;
  order_number: string;
  customer_name: string;
  status: CanonicalOrderStatus;
  payment_status: PaymentStatus;
  total: number;
  delivery_zone_name: string;
  created_at: string;
}

export interface AnalyticsDashboardReport {
  range: {
    from: string;
    to: string;
    previous_from: string;
    previous_to: string;
    days: number;
    granularity: "day" | "week";
  };
  include_owner_metrics: boolean;
  kpis: AnalyticsPeriodKpis;
  previous_kpis: AnalyticsPeriodKpis;
  revenue_series: AnalyticsRevenueSeriesPoint[];
  funnel: AnalyticsFunnel;
  top_products: AnalyticsTopProductRow[];
  sales_by_category: AnalyticsCategoryRow[];
  sales_by_zone: AnalyticsZoneRow[];
  busiest_times_heatmap: AnalyticsHeatmapCell[];
  cancellations_by_reason: AnalyticsCancelReasonRow[];
  status_breakdown: AnalyticsStatusRow[];
  inventory: AnalyticsInventoryTracker;
  needs_attention: AnalyticsNeedsAttention;
  recent_orders: AnalyticsRecentOrder[];
}

// ─── Real Verified Reviews (Phase 12) ────────────────────

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface PublicProductReview {
  id: string;
  product_id: string;
  display_name: string;
  rating: number;
  comment: string;
  photo_url: string | null;
  created_at: string;
}

export interface AdminReviewRecord {
  id: string;
  product_id: string;
  product_title: string;
  product_slug: string | null;
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
}

export type StoreSettingsUpdate = Partial<Omit<StoreSettings, "id" | "updated_at">>;

export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  active: boolean;
  sort_order: number;
  is_outside_nairobi: boolean;
  created_at: string;
  updated_at: string;
}

export type DeliveryZoneInsert = Omit<DeliveryZone, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export type DeliveryZoneUpdate = Partial<Omit<DeliveryZone, "id" | "created_at" | "updated_at">>;

// ─── Database Types ──────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      categories: { Row: Category; Insert: CategoryInsert; Update: CategoryUpdate };
      products: { Row: Product; Insert: ProductInsert; Update: ProductUpdate };
      orders: { Row: Order; Insert: OrderInsert; Update: OrderUpdate };
      order_items: { Row: OrderItem; Insert: OrderItemInsert; Update: OrderItemUpdate };
      store_settings: { Row: StoreSettings; Insert: Partial<StoreSettings>; Update: StoreSettingsUpdate };
      delivery_zones: { Row: DeliveryZone; Insert: DeliveryZoneInsert; Update: DeliveryZoneUpdate };
    };
    Enums: {
      order_status: OrderStatus;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
    };
  };
}
