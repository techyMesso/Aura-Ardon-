import { CheckoutPageClient } from "@/components/storefront/checkout-page-client";
import { getStoreSettings, listDeliveryZones } from "@/lib/data";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  title: "Checkout",
  description:
    "Send your Auro Ardon Nairobi order on WhatsApp and pay cash or M-Pesa on delivery.",
  pathname: "/checkout",
  noIndex: true
});

export default async function CheckoutPage() {
  const [deliveryZones, storeSettings] = await Promise.all([
    listDeliveryZones(),
    getStoreSettings()
  ]);

  return (
    <CheckoutPageClient
      deliveryZones={deliveryZones}
      freeDeliveryThreshold={storeSettings.free_delivery_threshold}
    />
  );
}
