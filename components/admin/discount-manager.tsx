"use client";

import { useState } from "react";
import { Pencil, Plus, Power, Tag, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatDiscountValueLabel,
  getDiscountLifecycleStatus,
  normalizeDiscountCode
} from "@/lib/discounts";
import type { DiscountCode, DiscountCodeType } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface DiscountManagerProps {
  initialDiscounts: DiscountCode[];
}

interface DiscountFormState {
  code: string;
  description: string;
  type: DiscountCodeType;
  value: string;
  min_order_amount: string;
  starts_at: string;
  ends_at: string;
  usage_limit: string;
  per_phone_limit: string;
  first_order_only: boolean;
  active: boolean;
}

const EMPTY_FORM: DiscountFormState = {
  code: "",
  description: "",
  type: "percent",
  value: "10",
  min_order_amount: "0",
  starts_at: "",
  ends_at: "",
  usage_limit: "",
  per_phone_limit: "",
  first_order_only: false,
  active: true
};

function isoToDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // Format as YYYY-MM-DDTHH:mm in EAT (+03:00)
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
    .format(date)
    .replace(" ", "T");
  return parts.slice(0, 16);
}

function datetimeLocalToEatIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `${trimmed}:00+03:00`;
}

function formatDateShort(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function statusBadgeStyle(status: ReturnType<typeof getDiscountLifecycleStatus>) {
  switch (status) {
    case "active":
      return "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200";
    case "scheduled":
      return "border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-500/40 dark:bg-blue-950/60 dark:text-blue-200";
    case "expired":
    case "exhausted":
      return "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200";
    case "inactive":
      return "border-border bg-stone text-muted";
  }
}

export function DiscountManager({ initialDiscounts }: DiscountManagerProps) {
  const [discounts, setDiscounts] = useState<DiscountCode[]>(initialDiscounts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<DiscountFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(dc: DiscountCode) {
    setEditingId(dc.id);
    setForm({
      code: dc.code,
      description: dc.description ?? "",
      type: dc.type,
      value: dc.type === "free_delivery" ? "0" : String(Number(dc.value)),
      min_order_amount: String(Number(dc.min_order_amount ?? 0)),
      starts_at: isoToDatetimeLocal(dc.starts_at),
      ends_at: isoToDatetimeLocal(dc.ends_at),
      usage_limit: dc.usage_limit != null ? String(dc.usage_limit) : "",
      per_phone_limit: dc.per_phone_limit != null ? String(dc.per_phone_limit) : "",
      first_order_only: dc.first_order_only,
      active: dc.active
    });
    setError(null);
    setFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      code: normalizeDiscountCode(form.code),
      description: form.description.trim() || null,
      type: form.type,
      value: form.type === "free_delivery" ? 0 : Number(form.value || 0),
      min_order_amount: Number(form.min_order_amount || 0),
      starts_at: datetimeLocalToEatIso(form.starts_at),
      ends_at: datetimeLocalToEatIso(form.ends_at),
      usage_limit: form.usage_limit.trim() ? Number(form.usage_limit) : null,
      per_phone_limit: form.per_phone_limit.trim()
        ? Number(form.per_phone_limit)
        : null,
      first_order_only: form.first_order_only,
      active: form.active
    };

    try {
      const response = await fetch(
        editingId ? `/api/admin/discounts/${editingId}` : "/api/admin/discounts",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = (await response.json()) as {
        discount?: DiscountCode;
        error?: string;
      };
      if (!response.ok || !data.discount) {
        throw new Error(data.error ?? "Unable to save discount code.");
      }

      if (editingId) {
        setDiscounts(current =>
          current.map(item => (item.id === editingId ? data.discount! : item))
        );
        setSuccess(`Discount code ${data.discount.code} updated.`);
      } else {
        setDiscounts(current => [data.discount!, ...current]);
        setSuccess(`Discount code ${data.discount.code} created.`);
      }
      setFormOpen(false);
      setEditingId(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save discount code."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(dc: DiscountCode) {
    setBusyId(dc.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/discounts/${dc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !dc.active })
      });
      const data = (await response.json()) as {
        discount?: DiscountCode;
        error?: string;
      };
      if (!response.ok || !data.discount) {
        throw new Error(data.error ?? "Unable to update discount code.");
      }
      setDiscounts(current =>
        current.map(item => (item.id === dc.id ? data.discount! : item))
      );
      setSuccess(
        `Discount code ${dc.code} ${data.discount.active ? "activated" : "paused"}.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update discount code."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(dc: DiscountCode) {
    if (
      !window.confirm(
        `Delete discount code "${dc.code}"? Codes with past redemptions will be deactivated instead.`
      )
    ) {
      return;
    }
    setBusyId(dc.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/discounts/${dc.id}`, {
        method: "DELETE"
      });
      const data = (await response.json()) as {
        ok?: boolean;
        deactivated?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to delete discount code.");
      }
      if (data.deactivated) {
        setDiscounts(current =>
          current.map(item => (item.id === dc.id ? { ...item, active: false } : item))
        );
        setSuccess(data.message ?? `${dc.code} deactivated.`);
      } else {
        setDiscounts(current => current.filter(item => item.id !== dc.id));
        setSuccess(`Discount code ${dc.code} deleted.`);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to delete discount code."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brass">Promotions</p>
          <h2 className="mt-1 font-serif text-3xl text-text">Discount codes</h2>
          <p className="mt-2 text-sm text-muted">
            Codes are case-insensitive and validated strictly on the server at checkout.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          New discount code
        </Button>
      </header>

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

      {/* Create / Edit Form */}
      {formOpen ? (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 border border-brass/50 bg-stone/40 p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-2xl text-text">
              {editingId ? `Edit ${form.code}` : "Create discount code"}
            </h3>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              aria-label="Close form"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] text-muted hover:bg-stone hover:text-text"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-text">
                Code <span className="text-brass">*</span>
              </span>
              <Input
                required
                placeholder="WELCOME10"
                value={form.code}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    code: event.target.value.toUpperCase()
                  }))
                }
                className="font-mono uppercase"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-text">Type</span>
              <select
                value={form.type}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    type: event.target.value as DiscountCodeType,
                    value:
                      event.target.value === "free_delivery"
                        ? "0"
                        : current.value === "0"
                          ? "10"
                          : current.value
                  }))
                }
                className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text outline-none focus:border-brass"
              >
                <option value="percent">Percentage (% off)</option>
                <option value="fixed">Fixed amount (KES off)</option>
                <option value="free_delivery">Free delivery</option>
              </select>
            </label>

            {form.type !== "free_delivery" ? (
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-text">
                  {form.type === "percent" ? "Percent (%)" : "Amount (KES)"}{" "}
                  <span className="text-brass">*</span>
                </span>
                <Input
                  type="number"
                  min="1"
                  max={form.type === "percent" ? "100" : undefined}
                  step="0.01"
                  required
                  value={form.value}
                  onChange={event =>
                    setForm(current => ({ ...current, value: event.target.value }))
                  }
                />
              </label>
            ) : (
              <div className="flex items-end pb-2 text-xs text-muted">
                Waives delivery fee for any zone (including Outside Nairobi).
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-text">Minimum order (KES)</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.min_order_amount}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    min_order_amount: event.target.value
                  }))
                }
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-text">Total usage limit</span>
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="Unlimited"
                value={form.usage_limit}
                onChange={event =>
                  setForm(current => ({ ...current, usage_limit: event.target.value }))
                }
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-text">Per-phone limit</span>
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="Unlimited"
                value={form.per_phone_limit}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    per_phone_limit: event.target.value
                  }))
                }
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-text">Starts at (EAT)</span>
              <Input
                type="datetime-local"
                value={form.starts_at}
                onChange={event =>
                  setForm(current => ({ ...current, starts_at: event.target.value }))
                }
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-text">Ends at (EAT)</span>
              <Input
                type="datetime-local"
                value={form.ends_at}
                onChange={event =>
                  setForm(current => ({ ...current, ends_at: event.target.value }))
                }
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-text">Internal note</span>
              <Input
                placeholder="e.g. Mother's Day campaign"
                value={form.description}
                onChange={event =>
                  setForm(current => ({ ...current, description: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-6 pt-1 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 text-text">
              <input
                type="checkbox"
                checked={form.first_order_only}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    first_order_only: event.target.checked
                  }))
                }
                className="h-4 w-4 accent-brass"
              />
              <span>First-order-only (new phone numbers only)</span>
            </label>

            <label className="inline-flex cursor-pointer items-center gap-2 text-text">
              <input
                type="checkbox"
                checked={form.active}
                onChange={event =>
                  setForm(current => ({ ...current, active: event.target.checked }))
                }
                className="h-4 w-4 accent-brass"
              />
              <span>Active immediately</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create code"}
            </Button>
          </div>
        </form>
      ) : null}

      {/* Discounts List */}
      {discounts.length === 0 ? (
        <div className="border border-dashed border-border bg-stone/50 p-10 text-center">
          <Tag className="mx-auto h-6 w-6 text-brass" aria-hidden />
          <p className="mt-2 font-medium text-text">No discount codes yet</p>
          <p className="mt-1 text-sm text-muted">
            Create percentage, fixed KES, or free-delivery promo codes for your WhatsApp shoppers.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border bg-paper">
          <table className="min-w-[780px] w-full divide-y divide-border text-left text-sm">
            <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Reward</th>
                <th className="px-4 py-3">Rules</th>
                <th className="px-4 py-3">Window</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {discounts.map(dc => {
                const status = getDiscountLifecycleStatus(dc);
                const busy = busyId === dc.id;
                return (
                  <tr key={dc.id} className={busy ? "opacity-60" : "hover:bg-stone/40"}>
                    <td className="px-4 py-3.5">
                      <p className="font-mono font-semibold text-text">{dc.code}</p>
                      {dc.description ? (
                        <p className="text-xs text-muted">{dc.description}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-text">
                      {formatDiscountValueLabel(dc.type, dc.value)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted space-y-0.5">
                      <p>
                        Min:{" "}
                        {Number(dc.min_order_amount) > 0
                          ? formatCurrency(dc.min_order_amount)
                          : "None"}
                      </p>
                      {dc.per_phone_limit ? <p>Max {dc.per_phone_limit}/phone</p> : null}
                      {dc.first_order_only ? (
                        <p className="font-semibold text-brass">First order only</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted">
                      <p>From: {formatDateShort(dc.starts_at)}</p>
                      <p>Until: {formatDateShort(dc.ends_at)}</p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-text">
                      {dc.used_count}
                      {dc.usage_limit ? ` / ${dc.usage_limit}` : " / ∞"}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-[2px] border px-2 py-0.5 text-xs font-semibold capitalize ${statusBadgeStyle(
                          status
                        )}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 w-9 p-0"
                          disabled={busy}
                          onClick={() => void handleToggleActive(dc)}
                          aria-label={`${dc.active ? "Pause" : "Activate"} ${dc.code}`}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 w-9 p-0"
                          disabled={busy}
                          onClick={() => openEdit(dc)}
                          aria-label={`Edit ${dc.code}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="h-9 w-9 p-0"
                          disabled={busy}
                          onClick={() => void handleDelete(dc)}
                          aria-label={`Delete ${dc.code}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

