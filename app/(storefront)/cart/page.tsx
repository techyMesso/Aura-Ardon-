import { CartPageClient } from "@/components/storefront/cart-page-client";

export const metadata = {
  title: "Your Shopping Cart | Auro Ardon",
  description: "Review your handcrafted jewelry, lip care, and hair accessories before checkout. Pay with M-Pesa or cash on delivery.",
};

export default function CartPage() {
  return <CartPageClient />;
}
