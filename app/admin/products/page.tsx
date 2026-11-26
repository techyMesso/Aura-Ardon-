import { ProductList } from "@/components/admin/product-list";
import {
  getStoreSettings,
  listBackInStockAlerts,
  PUBLIC_PRODUCT_SELECT
} from "@/lib/data";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { BackInStockAlert, Product } from "@/lib/types";

export const metadata = {
  title: "Products Admin",
  robots: { index: false, follow: false }
};

export default async function AdminProductsPage() {
  let products: Product[] = [];
  let restockedAlerts: BackInStockAlert[] = [];
  let loadError: string | null = null;
  const storeSettings = await getStoreSettings();

  try {
    const supabase = createAdminSupabaseClient();
    const [{ data, error }, alerts] = await Promise.all([
      supabase
        .from("products")
        .select(PUBLIC_PRODUCT_SELECT)
        .order("created_at", { ascending: false }),
      listBackInStockAlerts({ status: "waiting", restockedOnly: true }).catch(
        () => []
      )
    ]);
    if (error) throw new Error(error.message);
    products = (data ?? []) as unknown as Product[];
    restockedAlerts = alerts;
  } catch (error) {
    loadError = "Unable to load products. Please refresh the page and try again.";
    logger.error("Failed to fetch admin products", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return (
    <ProductList
      initialProducts={products}
      initialError={loadError}
      restockedAlerts={restockedAlerts}
      storeSettings={storeSettings}
    />
  );
}
