import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OrderManager } from "@/components/admin/order-manager";
import type { Order } from "@/lib/types";

export const metadata = {
  title: "Orders Admin | Auro Ardon",
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage() {
  let orders: Order[] = [];
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    orders = (data ?? []) as Order[];
  } catch (error) {
    console.error("Failed to fetch orders:", error);
  }

  return <OrderManager initialOrders={orders} />;
}
