"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Wallet
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminInvoiceListItem } from "@/lib/data";
import {
  computeInvoiceBalanceDue,
  getInvoiceStatusBadgeClassName,
  getInvoiceStatusLabel,
  NAIROBI_TIME_ZONE
} from "@/lib/invoices";
import type {
  DailyCashupReport,
  InvoicePaymentMethod,
  InvoiceStatus,
  MonthlySummaryReport
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface InvoicesHubProps {
  initialInvoices: AdminInvoiceListItem[];
  initialCashup: DailyCashupReport;
  initialMonthly: MonthlySummaryReport;
}

type HubTab = "invoices" | "outstanding" | "cashup" | "monthly";

function formatNairobiDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatNairobiTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function InvoicesHub({
  initialInvoices,
  initialCashup,
  initialMonthly
}: InvoicesHubProps) {
  const [activeTab, setActiveTab] = useState<HubTab>("invoices");

  // Invoices list state
  const [invoices, setInvoices] = useState<AdminInvoiceListItem[]>(initialInvoices);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [filters, setFilters] = useState<{
    status: "all" | InvoiceStatus;
    method: "all" | InvoicePaymentMethod;
    from: string;
    to: string;
    search: string;
  }>({
    status: "all",
    method: "all",
    from: "",
    to: "",
    search: ""
  });

  // Daily cash-up state
  const [cashupDate, setCashupDate] = useState(initialCashup.date);
  const [cashup, setCashup] = useState<DailyCashupReport>(initialCashup);
  const [loadingCashup, setLoadingCashup] = useState(false);

  // Monthly summary state
  const [monthIso, setMonthIso] = useState(initialMonthly.month);
  const [monthly, setMonthly] = useState<MonthlySummaryReport>(initialMonthly);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const outstandingInvoices = useMemo(
    () =>
      initialInvoices.filter(
        inv =>
          inv.order_status_canonical === "delivered" &&
          (inv.status === "unpaid" || inv.status === "partially_paid")
      ),
    [initialInvoices]
  );

  const outstandingTotal = useMemo(
    () =>
      outstandingInvoices.reduce(
        (sum, inv) => sum + computeInvoiceBalanceDue(inv),
        0
      ),
    [outstandingInvoices]
  );

  async function refreshInvoices(nextFilters = filters) {
    setLoadingInvoices(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextFilters.status !== "all") params.set("status", nextFilters.status);
      if (nextFilters.method !== "all") params.set("method", nextFilters.method);
      if (nextFilters.from) params.set("from", nextFilters.from);
      if (nextFilters.to) params.set("to", nextFilters.to);
      if (nextFilters.search.trim()) params.set("search", nextFilters.search.trim());

      const response = await fetch(`/api/admin/invoices?${params.toString()}`);
      const payload = (await response.json()) as {
        invoices?: AdminInvoiceListItem[];
        error?: string;
      };
      if (!response.ok || !payload.invoices) {
        throw new Error(payload.error ?? "Unable to load invoices.");
      }
      setInvoices(payload.invoices);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to load invoices."
      );
    } finally {
      setLoadingInvoices(false);
    }
  }

  async function loadCashup(date: string) {
    setLoadingCashup(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/reports/cashup?date=${encodeURIComponent(date)}`
      );
      const payload = (await response.json()) as {
        report?: DailyCashupReport;
        error?: string;
      };
      if (!response.ok || !payload.report) {
        throw new Error(payload.error ?? "Unable to load cash-up report.");
      }
      setCashup(payload.report);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load cash-up report."
      );
    } finally {
      setLoadingCashup(false);
    }
  }

  async function loadMonthly(month: string) {
    setLoadingMonthly(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/reports/monthly?month=${encodeURIComponent(month)}&format=json`
      );
      const payload = (await response.json()) as {
        report?: MonthlySummaryReport;
        error?: string;
      };
      if (!response.ok || !payload.report) {
        throw new Error(payload.error ?? "Unable to load monthly summary.");
      }
      setMonthly(payload.report);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load monthly summary."
      );
    } finally {
      setLoadingMonthly(false);
    }
  }

  const tabs: Array<{ id: HubTab; label: string; count?: number }> = [
    { id: "invoices", label: "Invoices", count: initialInvoices.length },
    { id: "outstanding", label: "Outstanding", count: outstandingInvoices.length },
    { id: "cashup", label: "Daily cash-up" },
    { id: "monthly", label: "Monthly summary" }
  ];

  return (
    <section className="min-w-0 space-y-6">
      <header className="border-b border-border pb-5">
        <p className="text-sm font-medium text-brass">Financial records</p>
        <h2 className="mt-1 font-serif text-3xl text-text">
          Invoices, receipts &amp; reports
        </h2>
        <p className="mt-2 text-sm text-muted">
          Issued invoices are permanent with gap-free yearly numbering (INV-YYYY-NNNN). Record cash and M-Pesa payments, reconcile daily cash-ups, and export monthly accountant reports.
        </p>
      </header>

      {/* Hub Tabs */}
      <div
        role="tablist"
        aria-label="Invoice and financial report views"
        className="flex gap-2 overflow-x-auto border-b border-border pb-3"
      >
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[2px] border px-4 text-sm font-medium transition ${
                active
                  ? "border-brass bg-brass text-ink"
                  : "border-border bg-paper text-muted hover:border-brass/60 hover:text-text"
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs ${
                    active ? "bg-ink/15 text-ink" : "bg-stone text-text"
                  }`}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}

      {/* TAB 1: ALL INVOICES */}
      {activeTab === "invoices" ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1.5 text-sm text-muted">
              <span>Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  className="pl-10"
                  placeholder="INV-, order, name, phone, M-Pesa"
                  value={filters.search}
                  onChange={event =>
                    setFilters(current => ({ ...current, search: event.target.value }))
                  }
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void refreshInvoices();
                    }
                  }}
                />
              </div>
            </label>

            <label className="space-y-1.5 text-sm text-muted">
              <span>Status</span>
              <select
                value={filters.status}
                onChange={event =>
                  setFilters(current => ({
                    ...current,
                    status: event.target.value as "all" | InvoiceStatus
                  }))
                }
                className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text outline-none focus:border-brass"
              >
                <option value="all">All statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="partially_paid">Partially paid</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </select>
            </label>

            <label className="space-y-1.5 text-sm text-muted">
              <span>Payment method</span>
              <select
                value={filters.method}
                onChange={event =>
                  setFilters(current => ({
                    ...current,
                    method: event.target.value as "all" | InvoicePaymentMethod
                  }))
                }
                className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text outline-none focus:border-brass"
              >
                <option value="all">All methods</option>
                <option value="mpesa">M-Pesa</option>
                <option value="cash">Cash</option>
              </select>
            </label>

            <label className="space-y-1.5 text-sm text-muted">
              <span>From</span>
              <Input
                type="date"
                value={filters.from}
                onChange={event =>
                  setFilters(current => ({ ...current, from: event.target.value }))
                }
              />
            </label>

            <label className="space-y-1.5 text-sm text-muted">
              <span>To</span>
              <Input
                type="date"
                value={filters.to}
                onChange={event =>
                  setFilters(current => ({ ...current, to: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void refreshInvoices()} disabled={loadingInvoices}>
              {loadingInvoices ? "Filtering..." : "Apply filters"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const reset = {
                  status: "all" as const,
                  method: "all" as const,
                  from: "",
                  to: "",
                  search: ""
                };
                setFilters(reset);
                void refreshInvoices(reset);
              }}
            >
              Clear
            </Button>
          </div>

          {invoices.length === 0 ? (
            <div className="border border-dashed border-border bg-stone/50 p-8 text-center">
              <p className="font-medium text-text">No invoices matched</p>
              <p className="mt-1 text-sm text-muted">
                Invoices are issued automatically when an order is confirmed.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-border bg-paper">
              <table className="min-w-[760px] w-full divide-y divide-border text-left text-sm">
                <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Issued</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Method(s)</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map(inv => {
                    const balance = computeInvoiceBalanceDue(inv);
                    return (
                      <tr key={inv.id} className="hover:bg-stone/50">
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/admin/invoices/${inv.id}`}
                            className="font-semibold text-text hover:text-brass hover:underline"
                          >
                            {inv.invoice_number}
                          </Link>
                          {inv.customer_snapshot?.order_number ? (
                            <p className="text-xs text-muted">
                              {inv.customer_snapshot.order_number}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-text">{inv.customer_snapshot?.full_name}</p>
                          <p className="text-xs text-muted">
                            {inv.customer_snapshot?.phone}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-muted">
                          {formatNairobiDate(inv.issued_at)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`rounded-[2px] border px-2 py-0.5 text-xs font-semibold ${getInvoiceStatusBadgeClassName(
                              inv.status
                            )}`}
                          >
                            {getInvoiceStatusLabel(inv.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted">
                          {inv.payment_methods.length > 0
                            ? inv.payment_methods
                                .map(m => (m === "mpesa" ? "M-Pesa" : "Cash"))
                                .join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-text">
                          {formatCurrency(inv.total)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-text">
                          {formatCurrency(balance)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Link
                            href={`/admin/invoices/${inv.id}`}
                            className="text-sm font-semibold text-brass hover:underline"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* TAB 2: OUTSTANDING (DELIVERED + UNPAID/PARTIALLY PAID) */}
      {activeTab === "outstanding" ? (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 border border-amber-400/50 bg-amber-50/50 p-4 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300"
                aria-hidden
              />
              <div>
                <p className="text-sm font-semibold text-text">
                  Outstanding invoices on delivered orders
                </p>
                <p className="text-xs text-muted">
                  Orders marked delivered whose payment has not yet been fully recorded.
                </p>
              </div>
            </div>
            <p className="font-serif text-2xl font-semibold text-text">
              {formatCurrency(outstandingTotal)}
            </p>
          </div>

          {outstandingInvoices.length === 0 ? (
            <div className="flex items-center gap-2 border border-emerald-400/40 bg-emerald-500/10 p-5 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
              <span>All delivered orders are paid in full. Zero outstanding balances.</span>
            </div>
          ) : (
            <div className="overflow-x-auto border border-border bg-paper">
              <table className="min-w-[660px] w-full divide-y divide-border text-left text-sm">
                <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Issued</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Balance due</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {outstandingInvoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-stone/50">
                      <td className="px-4 py-3.5 font-semibold text-text">
                        {inv.invoice_number}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-text">{inv.customer_snapshot?.full_name}</p>
                        <p className="text-xs text-muted">{inv.customer_snapshot?.phone}</p>
                      </td>
                      <td className="px-4 py-3.5 text-muted">
                        {formatNairobiDate(inv.issued_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-[2px] border px-2 py-0.5 text-xs font-semibold ${getInvoiceStatusBadgeClassName(
                            inv.status
                          )}`}
                        >
                          {getInvoiceStatusLabel(inv.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-text">
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-amber-800 dark:text-amber-300">
                        {formatCurrency(computeInvoiceBalanceDue(inv))}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/admin/invoices/${inv.id}`}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-brass hover:underline"
                        >
                          <Wallet className="h-3.5 w-3.5" aria-hidden />
                          Record payment
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* TAB 3: DAILY CASH-UP */}
      {activeTab === "cashup" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-3 border border-border bg-paper p-4">
            <label className="space-y-1.5 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-brass" aria-hidden />
                Date (EAT)
              </span>
              <Input
                type="date"
                value={cashupDate}
                onChange={event => setCashupDate(event.target.value)}
              />
            </label>
            <Button
              type="button"
              onClick={() => void loadCashup(cashupDate)}
              disabled={loadingCashup}
            >
              {loadingCashup ? "Loading..." : "Load cash-up"}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Expected</p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatCurrency(cashup.expectedTotal)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {cashup.expectedInvoiceCount} active invoice(s)
              </p>
            </article>
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Collected</p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatCurrency(cashup.collectedTotal)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {cashup.paymentCount} payment(s)
              </p>
            </article>
            <article
              className={`border p-4 ${
                cashup.difference === 0
                  ? "border-emerald-400/50 bg-emerald-500/10"
                  : "border-amber-400/60 bg-amber-500/10"
              }`}
            >
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Difference</p>
              <p
                className={`mt-2 font-serif text-2xl ${
                  cashup.difference === 0
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-amber-800 dark:text-amber-200"
                }`}
              >
                {cashup.difference > 0
                  ? `+${formatCurrency(cashup.difference)}`
                  : formatCurrency(cashup.difference)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {cashup.difference === 0
                  ? "Balanced"
                  : cashup.difference < 0
                    ? "Short / unpaid balance"
                    : "Includes prior-day collections"}
              </p>
            </article>
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Cash</p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatCurrency(cashup.cashTotal)}
              </p>
            </article>
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">M-Pesa</p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatCurrency(cashup.mpesaTotal)}
              </p>
            </article>
          </div>

          {/* Per Rider / Collector Breakdown */}
          <div className="border border-border bg-paper p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-serif text-2xl text-text">
                  Daily cash-up by rider
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Grouped by assigned delivery rider (or collector for unassigned orders). Total rider costs for {cashup.date}:{" "}
                  <span className="font-semibold text-text">
                    {formatCurrency(cashup.totalRiderCost ?? 0)}
                  </span>
                </p>
              </div>
              <Link
                href="/admin/riders?tab=dispatch"
                className="text-sm font-semibold text-brass hover:underline"
              >
                Open dispatch sheet
              </Link>
            </div>
            {cashup.byRider.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No deliveries or payments recorded on {cashup.date}.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto border border-border">
                <table className="min-w-[820px] w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-4 py-3">Rider / Collector</th>
                      <th className="px-4 py-3 text-right">Deliveries</th>
                      <th className="px-4 py-3 text-right">Expected</th>
                      <th className="px-4 py-3 text-right">Cash</th>
                      <th className="px-4 py-3 text-right">M-Pesa</th>
                      <th className="px-4 py-3 text-right">Collected</th>
                      <th className="px-4 py-3 text-right">Difference</th>
                      <th className="px-4 py-3 text-right">Rider cost</th>
                      <th className="px-4 py-3">M-Pesa codes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cashup.byRider.map(row => (
                      <tr key={row.riderId ?? row.receivedBy}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-text">{row.receivedBy}</p>
                          {row.riderPhone ? (
                            <p className="text-xs text-muted">{row.riderPhone}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right text-muted">
                          {row.deliveryCount}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-text">
                          {formatCurrency(row.expectedTotal)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted">
                          {formatCurrency(row.cashTotal)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted">
                          {formatCurrency(row.mpesaTotal)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-text">
                          {formatCurrency(row.totalCollected)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            row.difference === 0
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-amber-800 dark:text-amber-300"
                          }`}
                        >
                          {row.difference > 0
                            ? `+${formatCurrency(row.difference)}`
                            : formatCurrency(row.difference)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted">
                          {formatCurrency(row.riderCostTotal)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted">
                          {row.mpesaCodes.length > 0 ? row.mpesaCodes.join(", ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* M-Pesa Codes Detail */}
          {cashup.mpesaPayments.length > 0 ? (
            <div className="border border-border bg-paper p-5">
              <h3 className="font-serif text-2xl text-text">M-Pesa codes ({cashup.date})</h3>
              <div className="mt-4 overflow-x-auto border border-border">
                <table className="min-w-[540px] w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-4 py-2.5">Code</th>
                      <th className="px-4 py-2.5">Invoice</th>
                      <th className="px-4 py-2.5">Received by</th>
                      <th className="px-4 py-2.5">Time (EAT)</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cashup.mpesaPayments.map(entry => (
                      <tr key={entry.paymentId}>
                        <td className="px-4 py-2.5 font-mono font-semibold text-text">
                          {entry.mpesaCode}
                        </td>
                        <td className="px-4 py-2.5 text-text">{entry.invoiceNumber}</td>
                        <td className="px-4 py-2.5 text-muted">{entry.receivedBy}</td>
                        <td className="px-4 py-2.5 text-muted">
                          {formatNairobiTime(entry.paidAt)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-text">
                          {formatCurrency(entry.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* TAB 4: MONTHLY SUMMARY */}
      {activeTab === "monthly" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border border-border bg-paper p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1.5 text-sm text-muted">
                <span>Month (EAT)</span>
                <Input
                  type="month"
                  value={monthIso}
                  onChange={event => setMonthIso(event.target.value)}
                />
              </label>
              <Button
                type="button"
                onClick={() => void loadMonthly(monthIso)}
                disabled={loadingMonthly}
              >
                {loadingMonthly ? "Loading..." : "Load summary"}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/admin/reports/monthly?month=${encodeURIComponent(
                  monthly.month
                )}&format=csv`}
                className="btn-outline text-xs sm:text-sm"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                Export CSV (Accountant)
              </a>
              <a
                href={`/api/admin/reports/monthly?month=${encodeURIComponent(
                  monthly.month
                )}&format=pdf`}
                className="btn-primary text-xs sm:text-sm"
              >
                <Download className="h-4 w-4" aria-hidden />
                Export PDF
              </a>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="border border-border bg-paper p-5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-brass" aria-hidden />
                <h3 className="font-serif text-2xl text-text">
                  Sales breakdown ({monthly.month})
                </h3>
              </div>
              <dl className="mt-4 divide-y divide-border text-sm">
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Gross sales (items subtotal)</dt>
                  <dd className="font-medium text-text">
                    {formatCurrency(monthly.grossSales)}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Discounts</dt>
                  <dd className="text-emerald-700 dark:text-emerald-300">
                    -{formatCurrency(monthly.discounts)}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Delivery fees</dt>
                  <dd className="text-text">{formatCurrency(monthly.deliveryFees)}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">
                    Credit notes ({monthly.creditNoteCount})
                  </dt>
                  <dd className="text-purple-700 dark:text-purple-300">
                    -{formatCurrency(monthly.creditNotesTotal)}
                  </dd>
                </div>
                <div className="flex justify-between py-3 text-base font-semibold text-text">
                  <dt>Net sales</dt>
                  <dd>{formatCurrency(monthly.netSales)}</dd>
                </div>
              </dl>
            </div>

            <div className="border border-border bg-paper p-5">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-brass" aria-hidden />
                <h3 className="font-serif text-2xl text-text">
                  Payments by method ({monthly.month})
                </h3>
              </div>
              <dl className="mt-4 divide-y divide-border text-sm">
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Cash collected</dt>
                  <dd className="font-medium text-text">
                    {formatCurrency(monthly.cashCollected)}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">M-Pesa collected</dt>
                  <dd className="font-medium text-text">
                    {formatCurrency(monthly.mpesaCollected)}
                  </dd>
                </div>
                <div className="flex justify-between py-3 text-base font-semibold text-text">
                  <dt>Total collected ({monthly.paymentCount} payments)</dt>
                  <dd>{formatCurrency(monthly.totalCollected)}</dd>
                </div>
                <div className="flex justify-between py-2.5 text-xs text-muted">
                  <dt>Invoices issued in period</dt>
                  <dd>{monthly.invoiceCount}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

