import { DiscountManager } from "@/components/admin/discount-manager";
import { requireOwnerPage } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { DiscountCode } from "@/lib/types";

export const metadata = {
  title: "Discounts Admin",
  robots: { index: false, follow: false }
};

export default async function AdminDiscountsPage() {
  await requireOwnerPage();
  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("discount_codes")
    .select("*")
    .order("created_at", { ascending: false });

  return <DiscountManager initialDiscounts={(data ?? []) as DiscountCode[]} />;
}

