"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  FileMinus2,
  Link2Off,
  MessageCircle,
  Printer,
  Receipt,
  RefreshCcw,
  Wallet
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  buildInvoiceShareWhatsAppUrl,
  computeInvoiceBalanceDue,
  getInvoiceDocumentTitle,
  getInvoiceStatusBadgeClassName,
  getInvoiceStatusLabel,
  isShareTokenActive,
  isTestInvoice,
  isValidMpesaCode,
  NAIROBI_TIME_ZONE,
  normalizeMpesaCode,
  toMoneyNumber
} from "@/lib/invoices";
import { SITE_URL } from "@/lib/site";
import type { InvoiceDetailBundle, InvoicePaymentMethod } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface InvoiceDetailClientProps {
  initialBundle: InvoiceDetailBundle;
  adminEmail: string;
}

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

export function InvoiceDetailClient({
  initialBundle,
  adminEmail
}: InvoiceDetailClientProps) {
  const [bundle, setBundle] = useState<InvoiceDetailBundle>(initialBundle);
  const { invoice, payments, creditNotes } = bundle;
  const docTitle = getInvoiceDocumentTitle(invoice);
  const testWatermark = isTestInvoice(invoice);
  const balanceDue = computeInvoiceBalanceDue(invoice);
  const shareUrl = `${SITE_URL}/i/${invoice.share_token}`;
  const shareActive = isShareTokenActive(invoice);
  const whatsappShareUrl = shareActive
    ? buildInvoiceShareWhatsAppUrl(invoice, shareUrl)
    : null;

  // Record payment form state
  const [paymentAmount, setPaymentAmount] = useState(
    balanceDue > 0 ? String(balanceDue) : ""
  );
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>("mpesa");
  const [mpesaCode, setMpesaCode] = useState("");
  const [receivedBy, setReceivedBy] = useState(
    initialBundle.order?.rider_name || adminEmail || "Admin"
  );
  const [paymentNote, setPaymentNote] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  // Manual eTIMS ref state
  const [etimsRef, setEtimsRef] = useState(invoice.etims_invoice_number ?? "");
  const [savingMeta, setSavingMeta] = useState(false);

  // Credit note modal/form state
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(
    String(
      Math.max(
        0,
        toMoneyNumber(invoice.total) - toMoneyNumber(invoice.credited_amount)
      )
    )
  );
  const [creditReason, setCreditReason] = useState("");
  const [savingCredit, setSavingCredit] = useState(false);

  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleRecordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPayment) return;
    setError(null);
    setSuccess(null);

    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid payment amount greater than zero.");
      return;
    }

    if (paymentMethod === "mpesa" && !isValidMpesaCode(mpesaCode)) {
      setError(
        "Enter a valid M-Pesa confirmation code (10–12 uppercase letters/digits, e.g. SHK4P9X2M1)."
      );
      return;
    }

    setSavingPayment(true);
    try {
      const response = await fetch(`/api/admin/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          method: paymentMethod,
          mpesaCode: paymentMethod === "mpesa" ? normalizeMpesaCode(mpesaCode) : null,
          receivedBy: receivedBy.trim() || adminEmail || "Admin",
          note: paymentNote.trim() || null
        })
      });
      const payload = (await response.json()) as InvoiceDetailBundle & {
        balanceDue?: number;
        error?: string;
      };
      if (!response.ok || !payload.invoice) {
        throw new Error(payload.error ?? "Unable to record payment.");
      }

      setBundle({
        invoice: payload.invoice,
        payments: payload.payments ?? [],
        creditNotes: payload.creditNotes ?? [],
        order: payload.order ?? bundle.order
      });
      const nextBalance = computeInvoiceBalanceDue(payload.invoice);
      setPaymentAmount(nextBalance > 0 ? String(nextBalance) : "");
      setMpesaCode("");
      setPaymentNote("");
      setSuccess(
        nextBalance === 0
          ? `Payment recorded — ${payload.invoice.invoice_number} is now PAID.`
          : `Partial payment of ${formatCurrency(amount)} recorded. Balance remaining: ${formatCurrency(nextBalance)}.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to record payment."
      );
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleSaveEtims(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingMeta(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etimsInvoiceNumber: etimsRef.trim() || null
        })
      });
      const payload = (await response.json()) as InvoiceDetailBundle & {
        error?: string;
      };
      if (!response.ok || !payload.invoice) {
        throw new Error(payload.error ?? "Unable to save reference.");
      }
      setBundle({
        invoice: payload.invoice,
        payments: payload.payments ?? payments,
        creditNotes: payload.creditNotes ?? creditNotes,
        order: payload.order ?? bundle.order
      });
      setSuccess("Optional reference updated.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save reference."
      );
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleToggleShareRevoked() {
    setSavingMeta(true);
    setError(null);
    setSuccess(null);

    try {
      const nextRevoked = !invoice.share_revoked;
      const response = await fetch(`/api/admin/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareRevoked: nextRevoked })
      });
      const payload = (await response.json()) as InvoiceDetailBundle & {
        error?: string;
      };
      if (!response.ok || !payload.invoice) {
        throw new Error(payload.error ?? "Unable to update share link status.");
      }
      setBundle({
        invoice: payload.invoice,
        payments: payload.payments ?? payments,
        creditNotes: payload.creditNotes ?? creditNotes,
        order: payload.order ?? bundle.order
      });
      setSuccess(
        nextRevoked
          ? "Public share link revoked (customers opening it now get 404)."
          : "Public share link re-enabled."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update share link."
      );
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleIssueCreditNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingCredit) return;
    setError(null);
    setSuccess(null);

    const amount = Number(creditAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a credit note amount greater than zero.");
      return;
    }
    if (creditReason.trim().length < 3) {
      setError("Provide a reason for this credit note.");
      return;
    }

    setSavingCredit(true);
    try {
      const response = await fetch(`/api/admin/invoices/${invoice.id}/credit-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: creditReason.trim(),
          amount,
          lines: []
        })
      });
      const payload = (await response.json()) as InvoiceDetailBundle & {
        creditNote?: { credit_note_number?: string };
        error?: string;
      };
      if (!response.ok || !payload.invoice) {
        throw new Error(payload.error ?? "Unable to issue credit note.");
      }

      setBundle({
        invoice: payload.invoice,
        payments: payload.payments ?? [],
        creditNotes: payload.creditNotes ?? [],
        order: payload.order ?? bundle.order
      });
      setCreditOpen(false);
      setCreditReason("");
      const nextBalance = computeInvoiceBalanceDue(payload.invoice);
      setPaymentAmount(nextBalance > 0 ? String(nextBalance) : "");
      setSuccess(
        `Issued credit note ${payload.creditNote?.credit_note_number ?? ""} for ${formatCurrency(amount)}.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to issue credit note."
      );
    } finally {
      setSavingCredit(false);
    }
  }

  async function handleCopyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setError("Unable to copy share URL automatically.");
    }
  }

  const business = invoice.business_snapshot;
  const customer = invoice.customer_snapshot;
  const uncreditedRemaining = Math.max(
    0,
    toMoneyNumber(invoice.total) - toMoneyNumber(invoice.credited_amount)
  );

  return (
    <div className="min-w-0 space-y-6 print:space-y-4">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/admin/invoices"
            className="inline-flex items-center text-sm text-muted hover:text-brass"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            All invoices
          </Link>
          <Link
            href={`/admin/orders?order=${invoice.order_id}`}
            className="text-sm font-medium text-brass hover:underline"
          >
            View order {customer.order_number ?? `#${invoice.order_id.slice(0, 8)}`}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {whatsappShareUrl ? (
            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-xs sm:text-sm"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Send on WhatsApp
            </a>
          ) : null}
          <a
            href={`/api/admin/invoices/${invoice.id}/pdf?layout=a4&download=1`}
            className="btn-outline text-xs sm:text-sm"
          >
            <Download className="h-4 w-4" aria-hidden />
            PDF (A4)
          </a>
          <a
            href={`/api/admin/invoices/${invoice.id}/pdf?layout=receipt&download=1`}
            className="btn-outline text-xs sm:text-sm"
          >
            <Receipt className="h-4 w-4" aria-hidden />
            80mm Receipt
          </a>
          <Button variant="ghost" type="button" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden />
            Print
          </Button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 print:hidden"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          aria-live="polite"
          className="rounded-[2px] border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 print:hidden"
        >
          {success}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)] print:block">
        {/* Immutable Invoice Sheet */}
        <article className="relative min-w-0 overflow-hidden border border-border bg-paper p-5 text-text sm:p-8 print:border-none print:p-0">
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
            <div className="pointer-events-none absolute right-6 top-20 rotate-[-10deg] border-2 border-emerald-700 px-4 py-1 text-lg font-bold tracking-[0.25em] text-emerald-700 opacity-85 dark:border-emerald-400 dark:text-emerald-400">
              PAID
            </div>
          ) : invoice.status === "void" ? (
            <div className="pointer-events-none absolute right-6 top-20 rotate-[-10deg] border-2 border-red-700 px-4 py-1 text-lg font-bold tracking-[0.25em] text-red-700 opacity-85 dark:border-red-400 dark:text-red-400">
              VOID
            </div>
          ) : null}

          <div className="mb-6 flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
                {docTitle} (Immutable record)
              </p>
              <h1 className="mt-1 font-serif text-3xl text-text">
                {invoice.invoice_number}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
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
                {customer.order_number ? (
                  <span className="text-xs text-muted">
                    Order {customer.order_number}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted">
                Issued: {formatNairobiDate(invoice.issued_at)} · Due:{" "}
                {formatNairobiDate(invoice.due_at)}
              </p>
              {invoice.etims_invoice_number ? (
                <p className="text-xs text-muted">
                  eTIMS Ref: {invoice.etims_invoice_number}
                </p>
              ) : null}
            </div>

            <div className="text-left sm:text-right">
              <p className="font-serif text-xl font-semibold text-text">
                {business.site_name}
              </p>
              <p className="text-sm text-muted">{business.business_address}</p>
              <p className="text-sm text-muted">+{business.business_phone}</p>
              {business.business_email ? (
                <p className="text-sm text-muted">{business.business_email}</p>
              ) : null}
              {business.kra_pin ? (
                <p className="text-xs text-muted">PIN: {business.kra_pin}</p>
              ) : null}
            </div>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
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
              <p className="mt-2 text-sm text-text">
                {business.payment_instructions ||
                  "Pay via Cash or M-Pesa on delivery."}
              </p>
            </div>
          </div>

          <div className="mb-6 overflow-x-auto border border-border">
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
                {(invoice.lines_snapshot ?? []).map((line, index) => (
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

          <div className="flex flex-col items-stretch sm:items-end">
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
                <span>Paid</span>
                <span>{formatCurrency(invoice.amount_paid)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-text">
                <span>Balance due</span>
                <span>{formatCurrency(balanceDue)}</span>
              </div>
            </div>
          </div>

          {/* Recorded Payments */}
          {payments.length > 0 ? (
            <div className="mt-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Payment history ({payments.length})
              </p>
              <div className="overflow-x-auto border border-border">
                <table className="min-w-[480px] w-full divide-y divide-border text-sm">
                  <thead className="bg-stone text-left text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-3 py-2.5">Date (EAT)</th>
                      <th className="px-3 py-2.5">Method</th>
                      <th className="px-3 py-2.5">M-Pesa code</th>
                      <th className="px-3 py-2.5">Received by</th>
                      <th className="px-3 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-paper">
                    {payments.map(payment => (
                      <tr key={payment.id}>
                        <td className="px-3 py-2.5 text-muted">
                          {formatNairobiDateTime(payment.paid_at)}
                        </td>
                        <td className="px-3 py-2.5 text-text">
                          {payment.method === "mpesa" ? "M-Pesa" : "Cash"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-text">
                          {payment.mpesa_code ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-muted">{payment.received_by}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-text">
                          {formatCurrency(payment.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Credit notes */}
          {creditNotes.length > 0 ? (
            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">
                Credit notes ({creditNotes.length})
              </p>
              <ul className="space-y-2 text-sm">
                {creditNotes.map(cn => (
                  <li
                    key={cn.id}
                    className="rounded-[2px] border border-purple-400/40 bg-purple-500/5 px-3.5 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-text">
                        {cn.credit_note_number}
                      </span>
                      <span className="font-semibold text-purple-700 dark:text-purple-300">
                        -{formatCurrency(cn.amount)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {cn.reason} · {formatNairobiDateTime(cn.created_at)} · by{" "}
                      {cn.created_by}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-8 border-t border-border pt-4 text-xs text-muted">
            {business.invoice_footer}
          </p>
        </article>

        {/* Right Operations Column (Payments, Share Link, eTIMS ref, Credit Notes) */}
        <aside className="min-w-0 space-y-5 print:hidden">
          {/* Record Payment */}
          <section className="border border-border bg-paper p-5">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-brass" aria-hidden />
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-brass">
                Record payment
              </h2>
            </div>

            {invoice.status === "void" ? (
              <p className="mt-3 text-sm text-muted">
                This invoice is void and cannot accept payments.
              </p>
            ) : balanceDue <= 0 ? (
              <div className="mt-3 flex items-center gap-2 rounded-[2px] border border-emerald-400/50 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                <span>Paid in full ({formatCurrency(invoice.amount_paid)}).</span>
              </div>
            ) : (
              <form onSubmit={handleRecordPayment} className="mt-4 space-y-3.5">
                <div className="grid grid-cols-2 gap-2">
                  {(["mpesa", "cash"] as const).map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`min-h-10 rounded-[2px] border text-sm font-medium transition ${
                        paymentMethod === method
                          ? "border-brass bg-brass text-ink"
                          : "border-border bg-paper text-muted hover:text-text"
                      }`}
                    >
                      {method === "mpesa" ? "M-Pesa" : "Cash"}
                    </button>
                  ))}
                </div>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-text">
                    Amount (KES) · max {formatCurrency(balanceDue)}
                  </span>
                  <Input
                    type="number"
                    min="1"
                    max={balanceDue}
                    step="0.01"
                    required
                    value={paymentAmount}
                    onChange={event => setPaymentAmount(event.target.value)}
                  />
                </label>

                {paymentMethod === "mpesa" ? (
                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-text">
                      M-Pesa confirmation code <span className="text-brass">*</span>
                    </span>
                    <Input
                      type="text"
                      required
                      placeholder="e.g. SHK4P9X2M1"
                      value={mpesaCode}
                      onChange={event =>
                        setMpesaCode(event.target.value.toUpperCase())
                      }
                      className="font-mono uppercase"
                    />
                  </label>
                ) : null}

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-text">
                    Received by (rider or admin) <span className="text-brass">*</span>
                  </span>
                  <Input
                    type="text"
                    required
                    placeholder="Rider name or admin"
                    value={receivedBy}
                    onChange={event => setReceivedBy(event.target.value)}
                  />
                </label>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-text">Note (optional)</span>
                  <Input
                    type="text"
                    placeholder="e.g. Paid on delivery at Westlands"
                    value={paymentNote}
                    onChange={event => setPaymentNote(event.target.value)}
                  />
                </label>

                <Button type="submit" disabled={savingPayment} className="w-full">
                  {savingPayment ? "Recording..." : "Save payment"}
                </Button>
              </form>
            )}
          </section>

          {/* Share Link Controls */}
          <section className="space-y-3 border border-border bg-paper p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
              Customer share link (/i/…)
            </p>
            <p className="text-xs text-muted">
              {shareActive
                ? `Active until ${formatNairobiDate(invoice.share_expires_at)} (noindex, private token).`
                : invoice.share_revoked
                  ? "Link is revoked — customers opening it see 404."
                  : "Link has expired."}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 text-xs"
                onClick={() => void handleCopyShareLink()}
                disabled={!shareActive}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {copiedLink ? "Copied!" : "Copy link"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-xs"
                disabled={savingMeta}
                onClick={() => void handleToggleShareRevoked()}
              >
                {invoice.share_revoked ? (
                  <>
                    <RefreshCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Re-enable
                  </>
                ) : (
                  <>
                    <Link2Off className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Revoke
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* Optional Manual eTIMS Reference */}
          <section className="space-y-3 border border-border bg-paper p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
              Optional eTIMS reference
            </p>
            <p className="text-xs text-muted">
              Manually record a KRA eTIMS reference number for your accountant if issued separately. There is no automated KRA/eTIMS integration.
            </p>
            <form onSubmit={handleSaveEtims} className="flex gap-2">
              <Input
                placeholder="Optional eTIMS ref"
                value={etimsRef}
                onChange={event => setEtimsRef(event.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={savingMeta}>
                Save
              </Button>
            </form>
          </section>

          {/* Credit Note Section */}
          <section className="space-y-3 border border-border bg-paper p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                Corrections (Credit note)
              </p>
              {uncreditedRemaining > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setCreditOpen(open => !open)}
                >
                  <FileMinus2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {creditOpen ? "Close" : "Issue credit note"}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              Issued invoices are never edited or deleted. Cancellations and returns create credit notes automatically; you can also issue a manual credit note here.
            </p>

            {creditOpen && uncreditedRemaining > 0 ? (
              <form onSubmit={handleIssueCreditNote} className="space-y-3 pt-2">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-text">
                    Credit amount (KES, max {formatCurrency(uncreditedRemaining)})
                  </span>
                  <Input
                    type="number"
                    min="1"
                    max={uncreditedRemaining}
                    step="0.01"
                    required
                    value={creditAmount}
                    onChange={event => setCreditAmount(event.target.value)}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-text">
                    Reason <span className="text-brass">*</span>
                  </span>
                  <Textarea
                    rows={2}
                    required
                    placeholder="Price adjustment, goodwill credit, etc."
                    value={creditReason}
                    onChange={event => setCreditReason(event.target.value)}
                  />
                </label>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={savingCredit}
                  className="w-full"
                >
                  {savingCredit ? "Issuing..." : "Issue credit note"}
                </Button>
              </form>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

