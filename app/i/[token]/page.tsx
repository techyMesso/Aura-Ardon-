import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, FileText, Receipt } from "lucide-react";

import { PrintButton } from "@/components/admin/print-button";
import { getInvoiceByShareToken } from "@/lib/data";
import {
  computeInvoiceBalanceDue,
  getInvoiceDocumentTitle,
  getInvoiceStatusBadgeClassName,
  getInvoiceStatusLabel,
  isTestInvoice,
  NAIROBI_TIME_ZONE,
  toMoneyNumber
} from "@/lib/invoices";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice",
  robots: {
    index: false,
    follow: false,
    nocache: true
  }
};

function formatNairobiDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatNairobiDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default async function PublicInvoiceSharePage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const bundle = await getInvoiceByShareToken(token);

  if (!bundle) {
    notFound();
  }

  const { invoice, payments, creditNotes } = bundle;
  const docTitle = getInvoiceDocumentTitle(invoice);
  const testWatermark = isTestInvoice(invoice);
  const business = invoice.business_snapshot;
  const customer = invoice.customer_snapshot;
  const lines = invoice.lines_snapshot ?? [];
  const balanceDue = computeInvoiceBalanceDue(invoice);

  return (
    <main className="min-h-dvh bg-stone/50 px-4 py-6 text-text sm:py-10 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-5 print:max-w-none print:space-y-3">
        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 print:hidden">
          <div className="flex items-center gap-2 text-sm text-muted">
            <FileText className="h-4 w-4 text-brass" aria-hidden />
            <span>
              {docTitle} {invoice.invoice_number}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/i/${encodeURIComponent(token)}/pdf?layout=a4&download=1`}
              className="btn-primary text-xs sm:text-sm"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download PDF (A4)
            </a>
            <a
              href={`/api/i/${encodeURIComponent(token)}/pdf?layout=receipt&download=1`}
              className="btn-outline text-xs sm:text-sm"
            >
              <Receipt className="h-4 w-4" aria-hidden />
              80mm Receipt
            </a>
            <PrintButton />
          </div>
        </div>

        {/* Document sheet */}
        <article className="relative overflow-hidden border border-border bg-paper p-5 shadow-sm sm:p-8 print:border-none print:p-0 print:shadow-none">
          {testWatermark ? (
            <div
              aria-label="Test invoice watermark"
              className="pointer-events-none absolute inset-0 z-10 flex select-none items-center justify-center overflow-hidden"
            >
              <span className="-rotate-30 border-4 border-purple-600/35 px-10 py-3 font-serif text-7xl font-bold tracking-[0.35em] text-purple-600/25 sm:text-8xl">
                TEST
              </span>
            </div>
          ) : null}
          {invoice.status === "paid" ? (
            <div
              aria-label="Paid stamp"
              className="pointer-events-none absolute right-6 top-20 rotate-[-10deg] border-2 border-emerald-700 px-4 py-1 text-lg font-bold tracking-[0.25em] text-emerald-700 opacity-85 dark:border-emerald-400 dark:text-emerald-400 sm:right-10 sm:text-xl"
            >
              PAID
            </div>
          ) : invoice.status === "void" ? (
            <div
              aria-label="Void stamp"
              className="pointer-events-none absolute right-6 top-20 rotate-[-10deg] border-2 border-red-700 px-4 py-1 text-lg font-bold tracking-[0.25em] text-red-700 opacity-85 dark:border-red-400 dark:text-red-400 sm:right-10 sm:text-xl"
            >
              VOID
            </div>
          ) : null}

          <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-serif text-3xl text-text">
                {business.site_name || "Auro Ardon"}
              </h1>
              <p className="mt-1 text-sm text-muted">{business.business_address}</p>
              <p className="text-sm text-muted">+{business.business_phone}</p>
              {business.business_email ? (
                <p className="text-sm text-muted">{business.business_email}</p>
              ) : null}
              {business.kra_pin ? (
                <p className="text-xs text-muted">PIN: {business.kra_pin}</p>
              ) : null}
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
                {docTitle}
              </p>
              <p className="mt-1 font-serif text-2xl font-semibold text-text">
                {invoice.invoice_number}
              </p>
              <div className="mt-2 inline-flex flex-wrap items-center gap-1.5">
                {testWatermark ? (
                  <span className="rounded-[2px] border border-purple-400/70 bg-purple-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.14em] text-purple-900 dark:border-purple-500/50 dark:bg-purple-950/70 dark:text-purple-200">
                    TEST
                  </span>
                ) : null}
                <span
                  className={`rounded-[2px] border px-2.5 py-0.5 text-xs font-semibold ${getInvoiceStatusBadgeClassName(
                    invoice.status
                  )}`}
                >
                  {getInvoiceStatusLabel(invoice.status)}
                </span>
              </div>
              {customer.order_number ? (
                <p className="mt-2 text-xs text-muted">Order: {customer.order_number}</p>
              ) : null}
              <p className="text-xs text-muted">
                Issued: {formatNairobiDate(invoice.issued_at)}
              </p>
              <p className="text-xs text-muted">Due: {formatNairobiDate(invoice.due_at)}</p>
              {invoice.etims_invoice_number ? (
                <p className="text-xs text-muted">Ref: {invoice.etims_invoice_number}</p>
              ) : null}
            </div>
          </header>

          {/* Customer & payment instructions */}
          <div className="my-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[2px] border border-border bg-stone/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Billed to
              </p>
              <p className="mt-2 font-medium text-text">{customer.full_name}</p>
              <p className="text-sm text-muted">{customer.phone}</p>
              <p className="text-sm text-muted">
                {customer.delivery_zone_name
                  ? `${customer.delivery_zone_name} — ${customer.address}`
                  : customer.location || customer.address}
              </p>
              {customer.town_county ? (
                <p className="text-sm text-muted">{customer.town_county}</p>
              ) : null}
            </div>

            <div className="rounded-[2px] border border-border bg-stone/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Payment instructions
              </p>
              <p className="mt-2 text-sm leading-6 text-text">
                {business.payment_instructions ||
                  "Pay via Cash or M-Pesa on delivery."}
              </p>
            </div>
          </div>

          {/* Line items */}
          <div className="overflow-x-auto border border-border">
            <table className="min-w-[460px] w-full divide-y divide-border text-sm">
              <thead className="bg-stone text-left text-xs uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Unit price</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-paper">
                {lines.map((line, index) => (
                  <tr key={`${line.sku}-${index}`}>
                    <td className="px-4 py-3 font-medium text-text">{line.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{line.sku}</td>
                    <td className="px-4 py-3 text-right text-muted">{line.qty}</td>
                    <td className="px-4 py-3 text-right text-muted">
                      {formatCurrency(line.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-text">
                      {formatCurrency(line.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-6 flex flex-col items-stretch sm:items-end">
            <div className="w-full space-y-2 text-sm sm:w-72">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {toMoneyNumber(invoice.discount_amount) > 0 ? (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-300">
                  <span>
                    Discount
                    {invoice.discount_code ? ` (${invoice.discount_code})` : ""}
                  </span>
                  <span>-{formatCurrency(invoice.discount_amount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-muted">
                <span>Delivery</span>
                <span>
                  {toMoneyNumber(invoice.delivery_fee) === 0
                    ? "Free"
                    : formatCurrency(invoice.delivery_fee)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-text">
                <span>Total</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
              {toMoneyNumber(invoice.credited_amount) > 0 ? (
                <div className="flex justify-between text-purple-700 dark:text-purple-300">
                  <span>Credit notes</span>
                  <span>-{formatCurrency(invoice.credited_amount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-muted">
                <span>Amount paid</span>
                <span>{formatCurrency(invoice.amount_paid)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-text">
                <span>Balance due</span>
                <span>{formatCurrency(balanceDue)}</span>
              </div>
            </div>
          </div>

          {/* Payments */}
          {payments.length > 0 ? (
            <section className="mt-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Payment history
              </p>
              <div className="overflow-x-auto border border-border">
                <table className="min-w-[460px] w-full divide-y divide-border text-sm">
                  <thead className="bg-stone text-left text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-4 py-2.5">Date (EAT)</th>
                      <th className="px-4 py-2.5">Method</th>
                      <th className="px-4 py-2.5">M-Pesa code</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-paper">
                    {payments.map(payment => (
                      <tr key={payment.id}>
                        <td className="px-4 py-2.5 text-muted">
                          {formatNairobiDateTime(payment.paid_at)}
                        </td>
                        <td className="px-4 py-2.5 text-text">
                          {payment.method === "mpesa" ? "M-Pesa" : "Cash"}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-text">
                          {payment.mpesa_code ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-text">
                          {formatCurrency(payment.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* Credit notes */}
          {creditNotes.length > 0 ? (
            <section className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">
                Credit notes
              </p>
              <ul className="space-y-2 text-sm">
                {creditNotes.map(cn => (
                  <li
                    key={cn.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-border bg-stone/40 px-3.5 py-2.5"
                  >
                    <div>
                      <span className="font-semibold text-text">
                        {cn.credit_note_number}
                      </span>
                      <span className="ml-2 text-muted">{cn.reason}</span>
                    </div>
                    <span className="font-semibold text-purple-700 dark:text-purple-300">
                      -{formatCurrency(cn.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <footer className="mt-8 border-t border-border pt-4 text-xs text-muted">
            {business.invoice_footer ||
              "Thank you for shopping with Auro Ardon, Nairobi."}
          </footer>
        </article>
      </div>
    </main>
  );
}

