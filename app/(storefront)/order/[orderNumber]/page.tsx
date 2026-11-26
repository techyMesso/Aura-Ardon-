import { OrderConfirmationClient } from "@/components/storefront/order-confirmation-client";
import { getOrderByNumber, getStoreSettings } from "@/lib/data";
import { verifyOrderNumberToken } from "@/lib/order-status-token";
import { buildPageMetadata } from "@/lib/seo";
import { buildWhatsAppCheckoutUrl } from "@/lib/whatsapp-order";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  title: "Order Confirmation",
  description:
    "Confirm your Auro Ardon Nairobi order on WhatsApp and review delivery details.",
  pathname: "/order",
  noIndex: true
});

interface OrderConfirmationPageProps {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ t?: string; launch?: string }>;
}

export default async function OrderConfirmationPage({
  params,
  searchParams
}: OrderConfirmationPageProps) {
  const [{ orderNumber }, query, settings] = await Promise.all([
    params,
    searchParams,
    getStoreSettings()
  ]);

  const normalizedNumber = decodeURIComponent(orderNumber).trim().toUpperCase();
  const tokenValid = verifyOrderNumberToken(query.t, normalizedNumber);

  if (!tokenValid) {
    return (
      <OrderConfirmationClient
        orderNumber={normalizedNumber}
        initialOrder={null}
        autoLaunch={false}
        sameDayCutoff={settings.same_day_cutoff}
        businessHours={settings.business_hours}
        isStoreOpen={settings.is_store_open}
        holidayBannerMessage={settings.holiday_banner_message}
      />
    );
  }

  const record = await getOrderByNumber(normalizedNumber);
  if (!record) {
    return (
      <OrderConfirmationClient
        orderNumber={normalizedNumber}
        initialOrder={null}
        autoLaunch={false}
        sameDayCutoff={settings.same_day_cutoff}
        businessHours={settings.business_hours}
        isStoreOpen={settings.is_store_open}
        holidayBannerMessage={settings.holiday_banner_message}
      />
    );
  }

  const { order, items } = record;
  const resolvedNumber = order.order_number || normalizedNumber;
  const { url: whatsappUrl } = buildWhatsAppCheckoutUrl(
    settings.whatsapp_number,
    {
      orderNumber: resolvedNumber,
      items: items.map(item => ({
        title: item.product_title,
        quantity: item.quantity,
        lineTotal: Number(item.unit_price) * item.quantity
      })),
      subtotal: Number(order.subtotal),
      discountCode: order.discount_code ?? null,
      discountAmount: Number(order.discount_amount ?? 0),
      deliveryZoneName: order.delivery_zone_name || order.customer_location,
      deliveryFee: Number(order.shipping_fee),
      total: Number(order.total),
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      deliveryAddress: order.delivery_address || order.customer_location,
      townCounty: order.town_county ?? null,
      isGift: Boolean(order.is_gift),
      giftNote: order.gift_note ?? null,
      notes: order.notes ?? null
    }
  );

  return (
    <OrderConfirmationClient
      orderNumber={resolvedNumber}
      autoLaunch={query.launch === "1"}
      sameDayCutoff={settings.same_day_cutoff}
      businessHours={settings.business_hours}
      isStoreOpen={settings.is_store_open}
      holidayBannerMessage={settings.holiday_banner_message}
      initialOrder={{
        orderNumber: resolvedNumber,
        status: order.status || "pending",
        createdAt: order.created_at,
        customerName: order.customer_name,
        deliveryZoneName: order.delivery_zone_name || null,
        deliveryAddress: order.delivery_address || order.customer_location,
        townCounty: order.town_county ?? null,
        subtotal: Number(order.subtotal),
        discountCode: order.discount_code ?? null,
        discountAmount: Number(order.discount_amount ?? 0),
        deliveryFee: Number(order.shipping_fee),
        total: Number(order.total),
        isGift: Boolean(order.is_gift),
        giftNote: order.gift_note ?? null,
        items: items.map(item => ({
          id: item.id,
          title: item.product_title,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          lineTotal: Number(item.unit_price) * item.quantity
        })),
        whatsappUrl
      }}
    />
  );
}

