import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { CategoryManager } from "@/components/admin/category-manager";
import type { Category } from "@/lib/types";

export const metadata = {
  title: "Categories Admin | Auro Ardon",
  robots: { index: false, follow: false },
};

export default async function AdminCategoriesPage() {
  let categories: Category[] = [];
  try {
    const supabase = createAdminSupabaseClient();
    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("display_order", { ascending: true });
    categories = data ?? [];
  } catch (error) {
    logger.error("Failed to fetch admin categories", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return <CategoryManager initialCategories={categories} />;
}
