import { notFound } from "next/navigation";

import { OrderTrackingClient } from "@/components/storefront/order-tracking-client";
import { getOrderWithItems } from "@/lib/data";
import { verifyOrderStatusToken } from "@/lib/order-status-token";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Track Order",
  robots: { index: false, follow: false }
};

export default async function OrderTrackingPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token);
  const orderId = verifyOrderStatusToken(decodedToken);

  if (!orderId) {
    notFound();
  }

  const record = await getOrderWithItems(orderId);
  if (!record) {
    notFound();
  }

  const { order, items } = record;

  return (
    <OrderTrackingClient
      token={decodedToken}
      shortOrderId={order.id.slice(0, 8).toUpperCase()}
      createdAt={order.created_at}
      initialOrderStatus={order.order_status}
      initialPaymentStatus={order.payment_status}
      paymentMethod={order.payment_method}
      subtotal={order.subtotal}
      shippingFee={order.shipping_fee}
      total={order.total}
      items={items.map(item => ({
        id: item.id,
        product_title: item.product_title,
        quantity: item.quantity,
        unit_price: item.unit_price
      }))}
      whatsappNumber={process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? null}
    />
  );
}

