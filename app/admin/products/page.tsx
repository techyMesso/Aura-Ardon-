import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { ProductList } from "@/components/admin/product-list";
import type { Product } from "@/lib/types";

export const metadata = {
  title: "Products Admin | Auro Ardon",
  robots: { index: false, follow: false },
};

export default async function AdminProductsPage() {
  let products: Product[] = [];
  try {
    const supabase = createAdminSupabaseClient();
    const { data } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    products = data ?? [];
  } catch (error) {
    logger.error("Failed to fetch admin products", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return <ProductList initialProducts={products} />;
}
