import { CartPageClient } from "@/components/storefront/cart-page-client";

export const metadata = {
  title: "Your Shopping Cart | Auro Ardon",
  description: "Review your selected pieces before placing your order through WhatsApp or cash on delivery.",
};

export default function CartPage() {
  return <CartPageClient />;
}
