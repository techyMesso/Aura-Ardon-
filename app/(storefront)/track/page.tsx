import { TrackOrderClient } from "@/components/storefront/track-order-client";
import { getStoreSettings } from "@/lib/data";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Track Order",
  description:
    "Enter your Auro Ardon order number and phone number to check live delivery status in Nairobi and across Kenya.",
  pathname: "/track"
});

export default async function TrackOrderPage() {
  const settings = await getStoreSettings();
  return <TrackOrderClient whatsappNumber={settings.whatsapp_number} />;
}

