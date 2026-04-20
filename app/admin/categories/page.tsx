import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CategoryManager } from "@/components/admin/category-manager";

export const metadata = {
  title: "Categories Admin | Auro Ardon",
  robots: { index: false, follow: false },
};

export default async function AdminCategoriesPage() {
  let categories = [];
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("display_order", { ascending: true });
    categories = data ?? [];
  } catch (error) {
    console.error("Failed to fetch categories:", error);
  }

  return <CategoryManager initialCategories={categories} />;
}
