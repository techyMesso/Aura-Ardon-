import { notFound } from "next/navigation";
import { getOrderWithItems } from "@/lib/data";
import { logger } from "@/lib/logger";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PrintButton } from "@/components/admin/print-button";

export const metadata = {
  title: "Invoice | Auro Ardon",
  robots: { index: false, follow: false },
};

export default async function InvoicePage({
  params,
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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Link
          href="/admin/orders"
          className="inline-flex items-center text-sm text-muted hover:text-bronze"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to orders
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-[2rem] border border-white/60 bg-white/70 p-8 shadow-luxe backdrop-blur">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl text-ink">Invoice</h1>
            <p className="text-muted mt-1">Order #{order.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-sm text-muted">
              {new Date(order.created_at).toLocaleDateString("en-KE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-ink font-semibold">Auro Ardon</p>
            <p className="text-sm text-muted">Nairobi, Kenya</p>
            <p className="text-sm text-muted">contact@auroardon.com</p>
          </div>
        </div>

        <div className="mb-8 grid gap-8 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-bronze mb-2">
              Bill To
            </p>
            <p className="text-ink">{order.customer_name}</p>
            <p className="text-sm text-muted">{order.customer_phone}</p>
            {order.customer_email && <p className="text-sm text-muted">{order.customer_email}</p>}
            <p className="text-sm text-muted">{order.customer_location}</p>
            {order.notes && <p className="mt-2 text-sm italic text-muted">"{order.notes}"</p>}
          </div>
          <div className="sm:text-right">
            <div className="space-y-1">
              <div className="flex justify-between sm:justify-end">
                <span className="text-muted">Payment Method:</span>
                <span className="text-ink ml-2 sm:ml-0">{order.payment_method.toLowerCase().replace(/_/g, " ")}</span>
              </div>
              <div className="flex justify-between sm:justify-end">
                <span className="text-muted">Payment Status:</span>
                <span className="text-ink ml-2 sm:ml-0">{order.payment_status.toLowerCase()}</span>
              </div>
              <div className="flex justify-between sm:justify-end">
                <span className="text-muted">Order Status:</span>
                <Badge className="uppercase">{order.order_status.toLowerCase().replace(/_/g, " ")}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[1.5rem] border border-border mb-8">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-sand/50 text-left uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/80">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 text-ink">{item.product_title}</td>
                  <td className="px-4 py-4 text-right text-muted">{item.quantity}</td>
                  <td className="px-4 py-4 text-right text-muted">{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-4 text-right text-ink font-medium">
                    {formatCurrency(Number(item.unit_price) * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col items-end gap-2 text-sm">
          <div className="flex w-48 justify-between text-muted">
            <span>Subtotal</span>
            <span>{formatCurrency(order.subtotal)}</span>
          </div>
          <div className="flex w-48 justify-between text-muted">
            <span>Shipping</span>
            <span>{formatCurrency(order.shipping_fee)}</span>
          </div>
          <div className="flex w-48 justify-between border-t border-border pt-2 text-lg font-semibold text-ink">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted">
        Thank you for choosing Auro Ardon. Handcrafted with love in Nairobi.
      </p>
    </div>
  );
}
