import { CheckoutPageClient } from "@/components/storefront/checkout-page-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Checkout",
  description: "Place your order in minutes with cash on delivery or WhatsApp confirmation.",
};

export default function CheckoutPage() {
  return <CheckoutPageClient />;
}
