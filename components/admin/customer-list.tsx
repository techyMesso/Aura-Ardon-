"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Ban,
  Download,
  Flag,
  MessageCircle,
  Search,
  Users
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerListFilter } from "@/lib/data";
import { NAIROBI_TIME_ZONE } from "@/lib/invoices";
import type { Customer } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface CustomerListProps {
  initialCustomers: Customer[];
  optedInCount: number;
}

const FILTER_TABS: Array<{ value: CustomerListFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "opted_in", label: "Opted-in" },
  { value: "vip", label: "VIP" },
  { value: "flagged", label: "Flagged" },
  { value: "blocked", label: "Blocked" }
];

function formatNairobiDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function CustomerList({
  initialCustomers,
  optedInCount
}: CustomerListProps) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [filter, setFilter] = useState<CustomerListFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(nextFilter = filter, nextSearch = search) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextFilter !== "all") params.set("filter", nextFilter);
      if (nextSearch.trim()) params.set("search", nextSearch.trim());

      const response = await fetch(`/api/admin/customers?${params.toString()}`);
      const payload = (await response.json()) as {
        customers?: Customer[];
        error?: string;
      };
      if (!response.ok || !payload.customers) {
        throw new Error(payload.error ?? "Unable to load customers.");
      }
      setCustomers(payload.customers);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load customers."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-brass">CRM</p>
          <h2 className="mt-1 font-serif text-3xl text-text">Customers</h2>
          <p className="mt-2 text-sm text-muted">
            Keyed by normalised Kenyan phone number. Track repeat shoppers, tags, WhatsApp opt-ins, and review flags.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.location.assign("/api/admin/customers/export")}
          className="btn-primary shrink-0 text-xs sm:text-sm"
        >
          <Download className="h-4 w-4" aria-hidden />
          Export opted-in CSV ({optedInCount})
        </button>
      </header>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div
          role="tablist"
          aria-label="Filter customers"
          className="flex gap-1.5 overflow-x-auto pb-1"
        >
          {FILTER_TABS.map(tab => {
            const active = filter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setFilter(tab.value);
                  void refresh(tab.value, search);
                }}
                className={`min-h-10 shrink-0 rounded-[2px] border px-3.5 text-sm font-medium transition ${
                  active
                    ? "border-brass bg-brass text-ink"
                    : "border-border bg-paper text-muted hover:border-brass/60 hover:text-text"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={event => {
            event.preventDefault();
            void refresh(filter, search);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-10"
              placeholder="Name, phone, zone, tag"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? "..." : "Search"}
          </Button>
        </form>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}

      {customers.length === 0 ? (
        <div className="border border-dashed border-border bg-stone/50 p-10 text-center">
          <Users className="mx-auto h-6 w-6 text-brass" aria-hidden />
          <p className="mt-2 font-medium text-text">No customers matched</p>
          <p className="mt-1 text-sm text-muted">
            Customer profiles are automatically created and updated as orders come in.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {customers.map(customer => (
              <Link
                key={customer.id}
                href={`/admin/customers/${customer.id}`}
                className="block border border-border bg-paper p-4 transition hover:border-brass"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-text">
                      {customer.full_name}
                    </p>
                    <p className="text-xs text-muted">{customer.phone}</p>
                    {customer.last_zone ? (
                      <p className="mt-1 text-xs text-muted">{customer.last_zone}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-text">
                      {formatCurrency(customer.lifetime_value)}
                    </p>
                    <p className="text-xs text-muted">
                      {customer.order_count} order(s)
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {customer.is_blocked ? (
                    <span className="inline-flex items-center gap-1 rounded-[2px] bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-200">
                      <Ban className="h-3 w-3" aria-hidden /> Blocked
                    </span>
                  ) : null}
                  {customer.is_flagged ? (
                    <span className="inline-flex items-center gap-1 rounded-[2px] bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                      <Flag className="h-3 w-3" aria-hidden /> Flagged
                    </span>
                  ) : null}
                  {customer.marketing_opt_in && !customer.anonymized_at ? (
                    <span className="inline-flex items-center gap-1 rounded-[2px] bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                      <MessageCircle className="h-3 w-3" aria-hidden /> Opted-in
                    </span>
                  ) : null}
                  {(customer.tags ?? []).map(tag => (
                    <span
                      key={tag}
                      className="rounded-[2px] bg-stone px-2 py-0.5 text-[11px] font-medium text-text"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto border border-border bg-paper md:block">
            <table className="min-w-[780px] w-full divide-y divide-border text-left text-sm">
              <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Last zone</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-4 py-3 text-right">Cancelled</th>
                  <th className="px-4 py-3 text-right">Lifetime value</th>
                  <th className="px-4 py-3">Flags &amp; tags</th>
                  <th className="px-4 py-3">Last order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map(customer => (
                  <tr key={customer.id} className="hover:bg-stone/50">
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="font-semibold text-text hover:text-brass hover:underline"
                      >
                        {customer.full_name}
                      </Link>
                      {customer.anonymized_at ? (
                        <p className="text-xs text-muted">Anonymized</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-muted">
                      {customer.phone}
                    </td>
                    <td className="px-4 py-3.5 text-muted">
                      {customer.last_zone || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right text-text">
                      {customer.order_count}
                    </td>
                    <td className="px-4 py-3.5 text-right text-muted">
                      {customer.cancelled_count}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-text">
                      {formatCurrency(customer.lifetime_value)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {customer.is_blocked ? (
                          <span className="rounded-[2px] bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-200">
                            Blocked
                          </span>
                        ) : null}
                        {customer.is_flagged ? (
                          <span className="rounded-[2px] bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                            Flagged
                          </span>
                        ) : null}
                        {customer.marketing_opt_in && !customer.anonymized_at ? (
                          <span className="rounded-[2px] bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                            Opted-in
                          </span>
                        ) : null}
                        {(customer.tags ?? []).map(tag => (
                          <span
                            key={tag}
                            className="rounded-[2px] bg-stone px-2 py-0.5 text-xs text-text"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted">
                      {formatNairobiDate(customer.last_order_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

