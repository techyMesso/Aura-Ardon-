import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProductList } from "@/components/admin/product-list";

export const metadata = {
  title: "Products Admin | Auro Ardon",
  robots: { index: false, follow: false },
};

export default async function AdminProductsPage() {
  let products = [];
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    products = data ?? [];
  } catch (error) {
    console.error("Failed to fetch products:", error);
  }

  return <ProductList initialProducts={products} />;
}
