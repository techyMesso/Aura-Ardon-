"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Flag,
  MessageCircle,
  Plus,
  ShieldAlert,
  X
} from "lucide-react";

import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatOrderDisplayNumber,
  resolveCanonicalOrderStatus
} from "@/lib/admin-orders";
import {
  buildCustomerWhatsAppUrl,
  SUGGESTED_CUSTOMER_TAGS
} from "@/lib/customers";
import {
  getInvoiceStatusBadgeClassName,
  getInvoiceStatusLabel,
  NAIROBI_TIME_ZONE
} from "@/lib/invoices";
import type { Customer, CustomerDetailBundle } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface CustomerDetailClientProps {
  initialBundle: CustomerDetailBundle;
}

function formatNairobiDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function CustomerDetailClient({
  initialBundle
}: CustomerDetailClientProps) {
  const [bundle, setBundle] = useState<CustomerDetailBundle>(initialBundle);
  const { customer, orders, invoices } = bundle;
  const isAnonymized = Boolean(customer.anonymized_at);
  const whatsappUrl = buildCustomerWhatsAppUrl(customer);

  const [notes, setNotes] = useState(customer.notes ?? "");
  const [tags, setTags] = useState<string[]>(customer.tags ?? []);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);

  // Anonymize modal state
  const [anonModalOpen, setAnonModalOpen] = useState(false);
  const [anonConfirmText, setAnonConfirmText] = useState("");
  const [anonymizing, setAnonymizing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function patchCustomer(updates: Record<string, unknown>, message: string) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      const payload = (await response.json()) as {
        customer?: Customer;
        error?: string;
      };
      if (!response.ok || !payload.customer) {
        throw new Error(payload.error ?? "Unable to update customer.");
      }
      setBundle(current => ({ ...current, customer: payload.customer! }));
      setNotes(payload.customer.notes ?? "");
      setTags(payload.customer.tags ?? []);
      setSuccess(message);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update customer."
      );
    } finally {
      setSaving(false);
    }
  }

  function addTag(tagValue: string) {
    const clean = tagValue.trim();
    if (!clean) return;
    if (tags.some(existing => existing.toLowerCase() === clean.toLowerCase())) {
      setNewTag("");
      return;
    }
    const next = [...tags, clean];
    setTags(next);
    setNewTag("");
  }

  function removeTag(tagValue: string) {
    setTags(current => current.filter(t => t !== tagValue));
  }

  async function handleAnonymize(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (anonymizing) return;

    setAnonymizing(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/admin/customers/${customer.id}/anonymize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: anonConfirmText.trim() })
        }
      );
      const payload = (await response.json()) as CustomerDetailBundle & {
        ordersAnonymized?: number;
        invoicesAnonymized?: number;
        error?: string;
      };
      if (!response.ok || !payload.customer) {
        throw new Error(payload.error ?? "Unable to anonymize customer.");
      }
      setBundle({
        customer: payload.customer,
        orders: payload.orders ?? orders,
        invoices: payload.invoices ?? invoices
      });
      setNotes(payload.customer.notes ?? "");
      setTags(payload.customer.tags ?? []);
      setAnonModalOpen(false);
      setAnonConfirmText("");
      setSuccess(
        `Customer anonymized (${payload.ordersAnonymized ?? 0} order(s) and ${
          payload.invoicesAnonymized ?? 0
        } invoice(s) scrubbed while keeping all financial totals intact).`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to anonymize customer."
      );
    } finally {
      setAnonymizing(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-brass"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All customers
        </Link>

        {!isAnonymized ? (
          <div className="flex flex-wrap gap-2">
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-xs sm:text-sm"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp customer
              </a>
            ) : null}
            <Button
              type="button"
              variant={customer.is_flagged ? "secondary" : "ghost"}
              disabled={saving}
              onClick={() =>
                void patchCustomer(
                  { isFlagged: !customer.is_flagged },
                  !customer.is_flagged
                    ? "Phone flagged — future orders will be marked for review."
                    : "Review flag removed."
                )
              }
            >
              <Flag className="mr-1.5 h-4 w-4" aria-hidden />
              {customer.is_flagged ? "Unflag phone" : "Flag for review"}
            </Button>
            <Button
              type="button"
              variant={customer.is_blocked ? "secondary" : "destructive"}
              disabled={saving}
              onClick={() =>
                void patchCustomer(
                  { isBlocked: !customer.is_blocked },
                  !customer.is_blocked
                    ? 'Phone blocked — checkout will display "Please contact us on WhatsApp".'
                    : "Phone unblocked."
                )
              }
            >
              <Ban className="mr-1.5 h-4 w-4" aria-hidden />
              {customer.is_blocked ? "Unblock phone" : "Block phone"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          aria-live="polite"
          className="rounded-[2px] border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {success}
        </p>
      ) : null}

      {/* Header + Stats */}
      <section className="border border-border bg-paper p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brass">Customer profile</p>
            <h1 className="mt-1 font-serif text-3xl text-text">
              {customer.full_name}
            </h1>
            <p className="mt-1 font-mono text-sm text-muted">{customer.phone}</p>
            <p className="mt-1 text-xs text-muted">
              First order: {formatNairobiDateTime(customer.first_order_at)} · Last
              order: {formatNairobiDateTime(customer.last_order_at)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isAnonymized ? (
              <span className="rounded-[2px] border border-border bg-stone px-3 py-1 text-xs font-semibold text-muted">
                Anonymized on {formatNairobiDateTime(customer.anonymized_at)}
              </span>
            ) : null}
            {customer.is_blocked ? (
              <span className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-300">
                Blocked at checkout
              </span>
            ) : null}
            {customer.is_flagged ? (
              <span className="rounded-[2px] border border-amber-400/60 bg-amber-100/70 px-3 py-1 text-xs font-semibold text-amber-950 dark:bg-amber-950/60 dark:text-amber-200">
                Flagged for review
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border border-border bg-stone/40 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Lifetime value
            </p>
            <p className="mt-1.5 font-serif text-2xl text-text">
              {formatCurrency(customer.lifetime_value)}
            </p>
          </div>
          <div className="border border-border bg-stone/40 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Orders</p>
            <p className="mt-1.5 font-serif text-2xl text-text">
              {customer.order_count}
            </p>
          </div>
          <div className="border border-border bg-stone/40 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Cancelled
            </p>
            <p className="mt-1.5 font-serif text-2xl text-text">
              {customer.cancelled_count}
            </p>
          </div>
          <div className="border border-border bg-stone/40 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              WhatsApp marketing
            </p>
            <p className="mt-1.5 text-sm font-semibold text-text">
              {customer.marketing_opt_in && !isAnonymized
                ? "Opted in"
                : "Not opted in"}
            </p>
            {customer.marketing_opt_in_at ? (
              <p className="mt-0.5 text-xs text-muted">
                {formatNairobiDateTime(customer.marketing_opt_in_at)}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        {/* Left: Orders & Invoices */}
        <div className="min-w-0 space-y-6">
          <section className="border border-border bg-paper p-5">
            <h2 className="font-serif text-2xl text-text">
              Order history ({orders.length})
            </h2>
            {orders.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No orders linked yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto border border-border">
                <table className="min-w-[520px] w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-3.5 py-2.5">Order</th>
                      <th className="px-3.5 py-2.5">Date</th>
                      <th className="px-3.5 py-2.5">Status</th>
                      <th className="px-3.5 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {orders.map(order => (
                      <tr key={order.id} className="hover:bg-stone/40">
                        <td className="px-3.5 py-3">
                          <Link
                            href={`/admin/orders?order=${order.id}`}
                            className="font-semibold text-brass hover:underline"
                          >
                            {formatOrderDisplayNumber(order)}
                          </Link>
                        </td>
                        <td className="px-3.5 py-3 text-xs text-muted">
                          {formatNairobiDateTime(order.created_at)}
                        </td>
                        <td className="px-3.5 py-3">
                          <OrderStatusBadge
                            status={resolveCanonicalOrderStatus(order)}
                          />
                        </td>
                        <td className="px-3.5 py-3 text-right font-medium text-text">
                          {formatCurrency(order.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="border border-border bg-paper p-5">
            <h2 className="font-serif text-2xl text-text">
              Invoices ({invoices.length})
            </h2>
            {invoices.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No invoices issued for this customer yet.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto border border-border">
                <table className="min-w-[520px] w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-3.5 py-2.5">Invoice</th>
                      <th className="px-3.5 py-2.5">Issued</th>
                      <th className="px-3.5 py-2.5">Status</th>
                      <th className="px-3.5 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-stone/40">
                        <td className="px-3.5 py-3">
                          <Link
                            href={`/admin/invoices/${inv.id}`}
                            className="font-semibold text-brass hover:underline"
                          >
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="px-3.5 py-3 text-xs text-muted">
                          {formatNairobiDateTime(inv.issued_at)}
                        </td>
                        <td className="px-3.5 py-3">
                          <span
                            className={`rounded-[2px] border px-2 py-0.5 text-xs font-semibold ${getInvoiceStatusBadgeClassName(
                              inv.status
                            )}`}
                          >
                            {getInvoiceStatusLabel(inv.status)}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 text-right font-medium text-text">
                          {formatCurrency(inv.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right: Notes, Tags, Addresses, Data Deletion */}
        <aside className="min-w-0 space-y-5">
          <section className="space-y-4 border border-border bg-paper p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
              Notes &amp; tags
            </h2>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-[2px] border border-brass/40 bg-stone px-2.5 py-1 text-xs font-medium text-text"
                  >
                    {tag}
                    {!isAnonymized ? (
                      <button
                        type="button"
                        aria-label={`Remove tag ${tag}`}
                        onClick={() => removeTag(tag)}
                        className="text-muted hover:text-text"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>

              {!isAnonymized ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add tag (e.g. VIP)"
                      value={newTag}
                      onChange={event => setNewTag(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addTag(newTag);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => addTag(newTag)}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_CUSTOMER_TAGS.map(suggested => (
                      <button
                        key={suggested}
                        type="button"
                        onClick={() => addTag(suggested)}
                        className="rounded-[2px] border border-border px-2 py-0.5 text-xs text-muted hover:border-brass hover:text-text"
                      >
                        + {suggested}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-text">Internal notes</span>
              <Textarea
                rows={4}
                disabled={isAnonymized}
                placeholder="Sizing preferences, preferred delivery window, VIP notes..."
                value={notes}
                onChange={event => setNotes(event.target.value)}
              />
            </label>

            {!isAnonymized ? (
              <Button
                type="button"
                className="w-full"
                disabled={saving}
                onClick={() =>
                  void patchCustomer(
                    { notes: notes.trim() || null, tags },
                    "Customer notes and tags saved."
                  )
                }
              >
                {saving ? "Saving..." : "Save notes & tags"}
              </Button>
            ) : null}
          </section>

          <section className="space-y-3 border border-border bg-paper p-5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
              Names &amp; delivery addresses used
            </p>
            <div>
              <p className="text-xs text-muted">Names used</p>
              <p className="mt-0.5 text-text">
                {customer.names_used?.length
                  ? customer.names_used.join(", ")
                  : customer.full_name}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Zones</p>
              <p className="mt-0.5 text-text">
                {customer.zones_used?.length
                  ? customer.zones_used.join(", ")
                  : customer.last_zone || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Addresses</p>
              {customer.addresses_used?.length ? (
                <ul className="mt-1 space-y-1 text-xs text-text">
                  {customer.addresses_used.map(addr => (
                    <li key={addr}>• {addr}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-0.5 text-text">{customer.last_address || "—"}</p>
              )}
            </div>
          </section>

          {/* Owner Data Deletion / Anonymisation */}
          {!isAnonymized ? (
            <section className="space-y-3 border border-red-400/50 bg-red-500/5 p-5">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Data deletion request
                </p>
              </div>
              <p className="text-xs leading-5 text-muted">
                Permanently anonymises this customer&apos;s name, phone, and address across CRM, orders, and invoices (revoking share links) while keeping all order and invoice financial totals intact for accounting.
              </p>
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                onClick={() => setAnonModalOpen(true)}
              >
                Anonymise customer data
              </Button>
            </section>
          ) : null}
        </aside>
      </div>

      {/* Confirm Anonymisation Modal */}
      {anonModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="anonymize-customer-title"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-ink/60 backdrop-blur-[1px]"
            onClick={() => setAnonModalOpen(false)}
          />
          <form
            onSubmit={handleAnonymize}
            className="relative z-10 w-full max-w-md space-y-4 border border-border bg-paper p-6 text-text shadow-xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                <h3
                  id="anonymize-customer-title"
                  className="font-serif text-2xl text-text"
                >
                  Anonymise {customer.full_name}?
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setAnonModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center text-muted hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm leading-6 text-muted">
              This action is <strong className="text-text">irreversible</strong>. Personal identifiers (name, phone, delivery addresses, notes, marketing opt-in) will be scrubbed from this profile, {orders.length} order(s), and {invoices.length} invoice(s). All KES totals and payment records stay preserved for your accounts.
            </p>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-text">
                Type <code className="font-mono font-bold">ANONYMIZE</code> to confirm
              </span>
              <Input
                required
                placeholder="ANONYMIZE"
                value={anonConfirmText}
                onChange={event => setAnonConfirmText(event.target.value)}
                className="font-mono uppercase"
              />
            </label>

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAnonModalOpen(false)}
                disabled={anonymizing}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={anonymizing || anonConfirmText.trim() !== "ANONYMIZE"}
              >
                {anonymizing ? "Anonymising..." : "Confirm anonymisation"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

