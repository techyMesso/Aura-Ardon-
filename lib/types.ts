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
  created_at: string;
}

// ─── Product ─────────────────────────────────────────────
// Fields: id, title, slug, description, category, category_id, price,
//         stock_quantity, material, finish, size_label, in_the_box, care,
//         images, is_featured, active, created_at

export interface Product {
  id: string;
  title: string;           // DB column: title
  slug: string | null;
  description: string;
  category: string;        // human-readable category name (denormalized)
  category_id: string | null;
  price: string;
  stock_quantity: number;  // DB column: stock_quantity
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
  is_featured: boolean;   // DB column: is_featured
  active: boolean;        // NEW: active/inactive toggle
  blur_data_url?: string | null;
  created_at: string;
}

// ─── Cart ────────────────────────────────────────────────

export interface CartItem {
  product: Product;
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

// ─── OrderItem ───────────────────────────────────────────
// Fields: id, order_id, product_id, product_title, quantity, unit_price, created_at

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
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
