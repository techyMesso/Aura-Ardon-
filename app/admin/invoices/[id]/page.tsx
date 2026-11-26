import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { InvoiceDetailClient } from "@/components/admin/invoice-detail-client";
import { getCurrentUser } from "@/lib/auth";
import { getInvoiceDetailBundle, getOrderWithItems } from "@/lib/data";

export const metadata = {
  title: "Invoice",
  robots: { index: false, follow: false }
};

export default async function AdminInvoiceDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [bundle, user] = await Promise.all([
    getInvoiceDetailBundle(id),
    getCurrentUser()
  ]);

  if (!bundle) {
    // Check if the ID belongs to an order that hasn't been confirmed yet
    const pendingOrder = await getOrderWithItems(id);
    if (pendingOrder) {
      return (
        <section className="max-w-xl space-y-4 border border-border bg-paper p-6">
          <Link
            href={`/admin/orders?order=${pendingOrder.order.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-brass"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to order
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
            Invoice not yet issued
          </p>
          <h1 className="font-serif text-2xl text-text">
            Confirm this order to issue its invoice
          </h1>
          <p className="text-sm leading-6 text-muted">
            Invoices are issued automatically with a gap-free yearly number (
            <span className="font-mono text-text">INV-YYYY-NNNN</span>) as soon as an
            order is confirmed. Confirm{" "}
            <strong className="text-text">
              {pendingOrder.order.order_number ||
                `#${pendingOrder.order.id.slice(0, 8).toUpperCase()}`}
            </strong>{" "}
            from the Orders queue to generate its immutable invoice.
          </p>
          <Link
            href={`/admin/orders?order=${pendingOrder.order.id}`}
            className="btn-primary inline-flex"
          >
            Open order in fulfillment queue
          </Link>
        </section>
      );
    }

    notFound();
  }

  return (
    <InvoiceDetailClient
      initialBundle={bundle}
      adminEmail={user?.email ?? "admin"}
    />
  );
}
