import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BackInStockPanel } from "@/components/admin/back-in-stock-panel";
import { ProductForm } from "@/components/admin/product-form";
import { ProductStockLedger } from "@/components/admin/product-stock-ledger";
import { ProductVariantsManager } from "@/components/admin/product-variants-manager";
import { isOwnerUser, requireAdminPage } from "@/lib/auth";
import {
  getStoreSettings,
  listBackInStockAlerts,
  listProductStockMovements,
  listProductVariantsAdmin,
  OWNER_PRODUCT_SELECT,
  PUBLIC_PRODUCT_SELECT
} from "@/lib/data";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  BackInStockAlert,
  Category,
  Product,
  ProductVariant,
  StockMovement
} from "@/lib/types";

export const metadata = {
  title: "Edit Product",
  robots: { index: false, follow: false }
};

export default async function EditProductPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdminPage();
  const canManageCostPrice = isOwnerUser(user);
  const { id } = await params;

  let product: Product | null = null;
  let categories: Category[] = [];
  let initialVariants: ProductVariant[] = [];
  let initialMovements: StockMovement[] = [];
  let initialLedgerSum = 0;
  let waitingAlerts: BackInStockAlert[] = [];
  const storeSettings = await getStoreSettings();

  try {
    const supabase = createAdminSupabaseClient();
    const productColumns = canManageCostPrice
      ? OWNER_PRODUCT_SELECT
      : PUBLIC_PRODUCT_SELECT;

    const [
      { data: productData, error: productError },
      { data: categoryData, error: categoryError },
      variants,
      stockLedger,
      alerts
    ] = await Promise.all([
      supabase.from("products").select(productColumns).eq("id", id).single(),
      supabase
        .from("categories")
        .select("id, name, slug, parent_id, description, image_url, display_order, active, created_at")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      listProductVariantsAdmin(id, { includeCostPrice: canManageCostPrice }).catch(() => []),
      listProductStockMovements(id).catch(() => null),
      listBackInStockAlerts({ productId: id, status: "waiting" }).catch(() => [])
    ]);

    if (!productError && productData) product = productData as unknown as Product;
    if (categoryError) throw new Error(categoryError.message);
    categories = (categoryData ?? []) as Category[];
    initialVariants = variants;
    waitingAlerts = alerts;

    if (stockLedger) {
      initialMovements = stockLedger.movements;
      initialLedgerSum = stockLedger.ledgerSum;
    } else if (product) {
      initialLedgerSum = product.stock_quantity;
    }
  } catch (error) {
    logger.error("Failed to fetch admin product", {
      id,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  if (!product) notFound();

  return (
    <section className="min-w-0 border border-border bg-paper p-4 sm:p-6">
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted transition hover:text-brass sm:mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Products
      </Link>

      <div className="mb-6">
        <p className="text-sm font-medium text-brass">Inventory</p>
        <h2 className="font-serif text-3xl text-text">Edit product</h2>
        <p className="mt-2 text-sm text-muted">
          Update details, status, variants, images, and visibility. Stock changes always go through the ledger.
        </p>
      </div>

      <ProductForm
        initialProduct={product}
        categories={categories}
        canManageCostPrice={canManageCostPrice}
      />

      <ProductVariantsManager
        productId={product.id}
        basePrice={product.price}
        initialVariants={initialVariants}
        canManageCostPrice={canManageCostPrice}
      />

      <BackInStockPanel
        initialAlerts={waitingAlerts}
        storeSettings={storeSettings}
      />

      <ProductStockLedger
        productId={product.id}
        initialStock={product.stock_quantity}
        initialLedgerSum={initialLedgerSum}
        initialMovements={initialMovements}
        hasVariants={initialVariants.length > 0}
      />
    </section>
  );
}
