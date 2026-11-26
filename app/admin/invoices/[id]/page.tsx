import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PrintButton } from "@/components/admin/print-button";
import { Badge } from "@/components/ui/badge";
import { isGiftOrderWithHiddenPrices } from "@/lib/admin-orders";
import { formatProductTitle } from "@/lib/catalog";
import { getOrderWithItems } from "@/lib/data";
import { logger } from "@/lib/logger";
import { SITE_CONFIG } from "@/lib/site-config";
import { formatCurrency, formatWhatsAppNumber } from "@/lib/utils";

export const metadata = {
  title: "Invoice",
  robots: { index: false, follow: false }
};

export default async function InvoicePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let result;
  try {
    result = await getOrderWithItems(id);
  } catch (error) {
    logger.error("Failed to fetch invoice order", {
      id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  if (!result) notFound();

  const { order, items } = result;
  const hidePrices = isGiftOrderWithHiddenPrices(order.notes);
  const studioPhone = formatWhatsAppNumber(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);

  return (
    <div className="min-w-0 space-y-4 sm:space-y-8 print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/admin/orders"
          className="inline-flex items-center text-sm text-muted hover:text-brass"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to orders
        </Link>
        <PrintButton />
      </div>

      <div className="min-w-0 border border-border bg-paper p-4 text-text sm:p-8 print:border-none print:p-0">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl text-text">
              {hidePrices ? "Gift Packing Slip" : "Invoice"}
            </h1>
            <p className="mt-1 text-muted">
              Order {order.order_number || `#${order.id.slice(0, 8).toUpperCase()}`}
            </p>
            <p className="text-sm text-muted">
              {new Date(order.created_at).toLocaleDateString("en-KE", {
                day: "numeric",
                month: "long",
                year: "numeric"
              })}
            </p>
          </div>
          <div className="min-w-0 text-left sm:text-right">
            <p className="font-semibold text-text">{SITE_CONFIG.brandName}</p>
            <p className="text-sm text-muted">{SITE_CONFIG.studioLocation}</p>
            {studioPhone ? (
              <p className="text-sm text-muted">{studioPhone}</p>
            ) : null}
            <p className="text-sm text-muted">{SITE_CONFIG.studioHours}</p>
          </div>
        </div>

        <div className="mb-8 grid gap-8 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-brass">
              {hidePrices ? "Deliver To" : "Bill To"}
            </p>
            <p className="text-text">{order.customer_name}</p>
            <p className="text-sm text-muted">{order.customer_phone}</p>
            {order.customer_email ? (
              <p className="text-sm text-muted">{order.customer_email}</p>
            ) : null}
            <p className="text-sm text-muted">{order.customer_location}</p>
            {order.notes ? (
              <p className="mt-2 text-sm italic text-muted">&quot;{order.notes}&quot;</p>
            ) : null}
          </div>
          <div className="sm:text-right">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2 sm:justify-end">
                <span className="text-muted">Payment Method:</span>
                <span className="text-text">
                  {order.payment_method.toLowerCase().replace(/_/g, " ")}
                </span>
              </div>
              {!hidePrices ? (
                <div className="flex justify-between gap-2 sm:justify-end">
                  <span className="text-muted">Payment Status:</span>
                  <span className="text-text">{order.payment_status.toLowerCase()}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <span className="text-muted">Order Status:</span>
                <Badge className="uppercase">
                  {order.order_status.toLowerCase().replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 overflow-x-auto border border-border">
          <table className="w-full min-w-[420px] divide-y divide-border text-sm">
            <thead className="bg-stone text-left text-xs uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                {!hidePrices ? (
                  <>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-paper">
              {items.map(item => (
                <tr key={item.id}>
                  <td className="px-4 py-4 text-text">
                    {formatProductTitle(item.product_title)}
                  </td>
                  <td className="px-4 py-4 text-right text-muted">{item.quantity}</td>
                  {!hidePrices ? (
                    <>
                      <td className="px-4 py-4 text-right text-muted">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-text">
                        {formatCurrency(Number(item.unit_price) * item.quantity)}
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!hidePrices ? (
          <div className="flex flex-col items-stretch gap-2 text-sm sm:items-end">
            <div className="flex w-full justify-between text-muted sm:w-52">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex w-full justify-between text-muted sm:w-52">
              <span>Delivery</span>
              <span>
                {Number(order.shipping_fee) > 0
                  ? formatCurrency(order.shipping_fee)
                  : "Free"}
              </span>
            </div>
            <div className="flex w-full justify-between border-t border-border pt-2 text-lg font-semibold text-text sm:w-52">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Prices hidden per gift order request.
          </p>
        )}
      </div>

      <p className="text-center text-xs text-muted">
        Thank you for choosing {SITE_CONFIG.brandName}, {SITE_CONFIG.studioLocation}.
      </p>
    </div>
  );
}
