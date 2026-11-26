import { CartPageClient } from "@/components/storefront/cart-page-client";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  title: "Your Shopping Bag",
  description:
    "Review your selected pieces before sending your Auro Ardon order on WhatsApp with payment on delivery.",
  pathname: "/cart",
  noIndex: true
});

export default function CartPage() {
  return <CartPageClient />;
}
