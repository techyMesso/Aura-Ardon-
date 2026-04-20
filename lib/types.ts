// =========================================================
// Auro Ardon – Final TypeScript Types
// ALWAYS matches Supabase column names exactly
// =========================================================

// ─── Enums ───────────────────────────────────────────────

export type OrderStatus = "new" | "confirmed" | "delivered" | "cancelled";
export type PaymentMethod = "mpesa" | "cash_on_delivery";

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
//         stock_quantity, material, images, is_featured, active, created_at

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
  images: string[];
  is_featured: boolean;   // DB column: is_featured
  active: boolean;        // NEW: active/inactive toggle
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
//         order_status, subtotal, shipping_fee, total,
//         mpesa_receipt_number, checkout_request_id, created_at

export interface Order {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  customer_location: string;
  notes: string | null;
  payment_method: PaymentMethod;
  payment_status: string;
  order_status: OrderStatus;
  subtotal: string;
  shipping_fee: string;
  total: string;
  mpesa_receipt_number: string | null;
  checkout_request_id: string | null;
  created_at: string;
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

// ─── Admin User ──────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  active: boolean;
  created_at: string;
}

// ─── Database Types ──────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      categories: { Row: Category; Insert: any; Update: any };
      products: { Row: Product; Insert: any; Update: any };
      orders: { Row: Order; Insert: any; Update: any };
      order_items: { Row: OrderItem; Insert: any; Update: any };
      admin_users: { Row: AdminUser; Insert: any; Update: any };
    };
    Enums: {
      order_status: OrderStatus;
      payment_method: PaymentMethod;
    };
  };
}