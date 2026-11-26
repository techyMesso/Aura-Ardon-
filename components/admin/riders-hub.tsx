"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bike,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Edit3,
  FileSpreadsheet,
  Phone,
  Plus,
  Printer,
  Trash2,
  TrendingUp,
  UserCheck,
  UserX,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getCanonicalStatusLabel } from "@/lib/admin-orders";
import { NAIROBI_TIME_ZONE } from "@/lib/invoices";
import type {
  DeliveryMarginReport,
  DeliveryZone,
  DispatchSheetReport,
  Rider
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type TabId = "riders" | "dispatch" | "margin";

interface RidersHubProps {
  initialRiders: Rider[];
  deliveryZones: DeliveryZone[];
  initialDispatchSheet: DispatchSheetReport;
  initialDeliveryMargin: DeliveryMarginReport;
}

function formatNairobiDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function resolveInitialTab(param: string | null): TabId {
  if (param === "dispatch" || param === "margin" || param === "riders") {
    return param;
  }
  return "riders";
}

export function RidersHub({
  initialRiders,
  deliveryZones,
  initialDispatchSheet,
  initialDeliveryMargin
}: RidersHubProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    resolveInitialTab(searchParams.get("tab"))
  );

  // Riders CRUD state
  const [riders, setRiders] = useState<Rider[]>(initialRiders);
  const [editingRiderId, setEditingRiderId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [riderName, setRiderName] = useState("");
  const [riderPhone, setRiderPhone] = useState("");
  const [riderDefaultCost, setRiderDefaultCost] = useState("200");
  const [riderActive, setRiderActive] = useState(true);
  const [riderNotes, setRiderNotes] = useState("");
  const [zoneCostsInput, setZoneCostsInput] = useState<Record<string, string>>({});
  const [showZoneOverrides, setShowZoneOverrides] = useState(false);
  const [savingRider, setSavingRider] = useState(false);

  // Dispatch sheet state
  const [dispatchDate, setDispatchDate] = useState(initialDispatchSheet.date);
  const [dispatchRiderFilter, setDispatchRiderFilter] = useState("");
  const [includeConfirmed, setIncludeConfirmed] = useState(false);
  const [dispatchSheet, setDispatchSheet] = useState<DispatchSheetReport>(
    initialDispatchSheet
  );
  const [loadingDispatch, setLoadingDispatch] = useState(false);

  // Delivery margin state
  const [marginFrom, setMarginFrom] = useState(initialDeliveryMargin.from);
  const [marginTo, setMarginTo] = useState(initialDeliveryMargin.to);
  const [marginReport, setMarginReport] = useState<DeliveryMarginReport>(
    initialDeliveryMargin
  );
  const [loadingMargin, setLoadingMargin] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const zoneNameById = useMemo(
    () => new Map(deliveryZones.map(zone => [zone.id, zone.name])),
    [deliveryZones]
  );

  const activeRidersCount = useMemo(
    () => riders.filter(rider => rider.active).length,
    [riders]
  );

  function openCreateRiderForm() {
    setEditingRiderId(null);
    setRiderName("");
    setRiderPhone("");
    setRiderDefaultCost("200");
    setRiderActive(true);
    setRiderNotes("");
    setZoneCostsInput({});
    setShowZoneOverrides(false);
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  }

  function openEditRiderForm(rider: Rider) {
    setEditingRiderId(rider.id);
    setRiderName(rider.name);
    setRiderPhone(rider.phone);
    setRiderDefaultCost(String(rider.default_cost));
    setRiderActive(rider.active);
    setRiderNotes(rider.notes ?? "");
    const nextZoneMap: Record<string, string> = {};
    for (const [zoneId, cost] of Object.entries(rider.zone_costs ?? {})) {
      nextZoneMap[zoneId] = String(cost);
    }
    setZoneCostsInput(nextZoneMap);
    setShowZoneOverrides(Object.keys(nextZoneMap).length > 0);
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  }

  async function handleSaveRider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRider(true);
    setError(null);
    setSuccess(null);

    try {
      const parsedDefault = Number(riderDefaultCost);
      if (!Number.isFinite(parsedDefault) || parsedDefault < 0) {
        throw new Error("Default cost per delivery must be 0 or higher.");
      }

      const zoneCosts: Record<string, number> = {};
      for (const [zoneId, raw] of Object.entries(zoneCostsInput)) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(
            `Invalid cost for ${zoneNameById.get(zoneId) ?? "zone"}. Enter 0 or higher.`
          );
        }
        zoneCosts[zoneId] = parsed;
      }

      const endpoint = editingRiderId
        ? `/api/admin/riders/${editingRiderId}`
        : "/api/admin/riders";
      const method = editingRiderId ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: riderName.trim(),
          phone: riderPhone.trim(),
          active: riderActive,
          defaultCost: parsedDefault,
          zoneCosts,
          notes: riderNotes.trim() || null
        })
      });

      const payload = (await response.json()) as { rider?: Rider; error?: string };
      if (!response.ok || !payload.rider) {
        throw new Error(payload.error ?? "Unable to save rider.");
      }

      if (editingRiderId) {
        setRiders(current =>
          current
            .map(item => (item.id === payload.rider!.id ? payload.rider! : item))
            .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
        );
        setSuccess(`Updated rider ${payload.rider.name}.`);
      } else {
        setRiders(current =>
          [...current, payload.rider!].sort(
            (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)
          )
        );
        setSuccess(`Added rider ${payload.rider.name}.`);
      }

      setFormOpen(false);
      setEditingRiderId(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to save rider."
      );
    } finally {
      setSavingRider(false);
    }
  }

  async function handleToggleRiderActive(rider: Rider) {
    setSavingRider(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/riders/${rider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !rider.active })
      });
      const payload = (await response.json()) as { rider?: Rider; error?: string };
      if (!response.ok || !payload.rider) {
        throw new Error(payload.error ?? "Unable to update rider status.");
      }

      setRiders(current =>
        current
          .map(item => (item.id === rider.id ? payload.rider! : item))
          .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
      );
      setSuccess(
        payload.rider.active
          ? `${payload.rider.name} marked active.`
          : `${payload.rider.name} marked inactive.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update rider status."
      );
    } finally {
      setSavingRider(false);
    }
  }

  async function handleDeleteRider(rider: Rider) {
    setSavingRider(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/riders/${rider.id}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as {
        deleted?: boolean;
        archived?: boolean;
        rider?: Rider;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to remove rider.");
      }

      if (payload.archived && payload.rider) {
        setRiders(current =>
          current.map(item => (item.id === rider.id ? payload.rider! : item))
        );
        setSuccess(
          payload.message ?? `${rider.name} was deactivated to preserve order history.`
        );
      } else {
        setRiders(current => current.filter(item => item.id !== rider.id));
        setSuccess(`Removed rider ${rider.name}.`);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to remove rider."
      );
    } finally {
      setSavingRider(false);
    }
  }

  async function loadDispatchSheet(
    nextDate = dispatchDate,
    nextRiderId = dispatchRiderFilter,
    nextIncludeConfirmed = includeConfirmed
  ) {
    setLoadingDispatch(true);
    setError(null);

    try {
      const params = new URLSearchParams({ date: nextDate });
      if (nextRiderId) params.set("riderId", nextRiderId);
      if (nextIncludeConfirmed) params.set("includeConfirmed", "true");

      const response = await fetch(`/api/admin/reports/dispatch-sheet?${params.toString()}`);
      const payload = (await response.json()) as {
        report?: DispatchSheetReport;
        error?: string;
      };
      if (!response.ok || !payload.report) {
        throw new Error(payload.error ?? "Unable to load dispatch sheet.");
      }

      setDispatchSheet(payload.report);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load dispatch sheet."
      );
    } finally {
      setLoadingDispatch(false);
    }
  }

  async function loadDeliveryMargin(nextFrom = marginFrom, nextTo = marginTo) {
    setLoadingMargin(true);
    setError(null);

    try {
      const params = new URLSearchParams({ from: nextFrom, to: nextTo });
      const response = await fetch(`/api/admin/reports/delivery-margin?${params.toString()}`);
      const payload = (await response.json()) as {
        report?: DeliveryMarginReport;
        error?: string;
      };
      if (!response.ok || !payload.report) {
        throw new Error(payload.error ?? "Unable to load delivery margin report.");
      }

      setMarginReport(payload.report);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load delivery margin report."
      );
    } finally {
      setLoadingMargin(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Screen Header & Tabs */}
      <div className="space-y-4 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brass">Fulfillment &amp; Logistics</p>
            <h2 className="font-serif text-3xl text-text">Delivery &amp; Riders</h2>
            <p className="mt-1 text-sm text-muted">
              Manage Nairobi riders and per-zone delivery costs, print daily dispatch sheets, and track delivery fees charged vs rider costs.
            </p>
          </div>
          {activeTab === "riders" ? (
            <Button type="button" onClick={openCreateRiderForm}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Add rider
            </Button>
          ) : null}
        </div>

        <div
          role="tablist"
          aria-label="Delivery and riders workspace sections"
          className="flex gap-1.5 overflow-x-auto border-b border-border pb-3"
        >
          {(
            [
              { id: "riders", label: `Riders (${activeRidersCount} active)`, Icon: Bike },
              {
                id: "dispatch",
                label: `Dispatch sheet (${dispatchSheet.totalOrders})`,
                Icon: ClipboardList
              },
              { id: "margin", label: "Delivery margin", Icon: TrendingUp }
            ] as const
          ).map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveTab(tab.id);
                  setError(null);
                  setSuccess(null);
                }}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[2px] border px-3.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-brass ${
                  active
                    ? "border-brass bg-brass text-ink"
                    : "border-border bg-paper text-muted hover:border-brass/60 hover:text-text"
                }`}
              >
                <tab.Icon className="h-4 w-4" aria-hidden />
                {tab.label}
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
        {success ? (
          <p
            aria-live="polite"
            className="rounded-[2px] border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
          >
            {success}
          </p>
        ) : null}
      </div>

      {/* ─── TAB 1: RIDERS DIRECTORY ────────────────────────── */}
      {activeTab === "riders" ? (
        <div className="space-y-5 print:hidden">
          {formOpen ? (
            <form
              onSubmit={handleSaveRider}
              className="space-y-4 border border-brass/50 bg-stone/40 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                    {editingRiderId ? "Edit rider" : "New rider"}
                  </p>
                  <h3 className="mt-1 font-serif text-2xl text-text">
                    {editingRiderId ? riderName || "Update rider" : "Add a delivery rider"}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="Close rider form"
                  onClick={() => setFormOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] text-muted hover:bg-stone hover:text-text"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-text">
                    Rider name <span className="text-brass">*</span>
                  </span>
                  <Input
                    required
                    placeholder="e.g. Brian Otieno"
                    value={riderName}
                    onChange={event => setRiderName(event.target.value)}
                  />
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-text">
                    Phone (Kenya) <span className="text-brass">*</span>
                  </span>
                  <Input
                    required
                    placeholder="e.g. 0712 345 678"
                    value={riderPhone}
                    onChange={event => setRiderPhone(event.target.value)}
                  />
                </label>

                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-text">
                    Default cost per delivery (KES) <span className="text-brass">*</span>
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={riderDefaultCost}
                    onChange={event => setRiderDefaultCost(event.target.value)}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-text">Notes (optional)</span>
                  <Textarea
                    rows={2}
                    placeholder="Preferred routes, bike plate, courier company, payout notes..."
                    value={riderNotes}
                    onChange={event => setRiderNotes(event.target.value)}
                  />
                </label>

                <div className="flex flex-col justify-between gap-3 pt-1">
                  <label className="inline-flex items-center gap-2.5 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={riderActive}
                      onChange={event => setRiderActive(event.target.checked)}
                      className="h-4 w-4 accent-brass"
                    />
                    <span>Active (available when dispatching orders)</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowZoneOverrides(current => !current)}
                    className="self-start text-xs font-semibold uppercase tracking-[0.14em] text-brass underline underline-offset-4 hover:opacity-80"
                  >
                    {showZoneOverrides
                      ? "Hide per-zone cost overrides"
                      : `Set optional per-zone rider costs (${Object.values(zoneCostsInput).filter(Boolean).length} set)`}
                  </button>
                </div>
              </div>

              {showZoneOverrides ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-medium text-text">
                      Optional per-zone rider costs (KES)
                    </p>
                    <p className="text-xs text-muted">
                      Leave any zone blank to use the rider&apos;s default cost ({formatCurrency(Number(riderDefaultCost) || 0)}).
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {deliveryZones.map(zone => (
                      <label
                        key={zone.id}
                        className="flex flex-col justify-between gap-1 rounded-[2px] border border-border bg-paper p-2.5 text-xs"
                      >
                        <span className="font-medium text-text">
                          {zone.name}{" "}
                          <span className="font-normal text-muted">
                            (fee {formatCurrency(zone.fee)})
                          </span>
                        </span>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder={`Default (${riderDefaultCost || "0"})`}
                          value={zoneCostsInput[zone.id] ?? ""}
                          onChange={event =>
                            setZoneCostsInput(current => ({
                              ...current,
                              [zone.id]: event.target.value
                            }))
                          }
                          className="h-9 text-sm"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setFormOpen(false)}
                  disabled={savingRider}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={savingRider}>
                  {savingRider
                    ? "Saving..."
                    : editingRiderId
                      ? "Save rider changes"
                      : "Create rider"}
                </Button>
              </div>
            </form>
          ) : null}

          {riders.length === 0 ? (
            <div className="border border-border bg-paper p-10 text-center">
              <Bike className="mx-auto h-8 w-8 text-brass" aria-hidden />
              <h3 className="mt-3 font-serif text-2xl text-text">No riders added yet</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Add your regular Nairobi boda riders or courier contacts with their default and per-zone delivery costs. Their name and phone automatically populate dispatched WhatsApp messages.
              </p>
              <Button type="button" className="mt-4" onClick={openCreateRiderForm}>
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Add your first rider
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto border border-border bg-paper">
              <table className="min-w-[720px] w-full divide-y divide-border text-left text-sm">
                <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-4 py-3">Rider</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Default cost</th>
                    <th className="px-4 py-3">Zone overrides</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {riders.map(rider => {
                    const zoneEntries = Object.entries(rider.zone_costs ?? {});
                    return (
                      <tr key={rider.id} className="hover:bg-stone/40">
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-text">{rider.name}</p>
                          {rider.notes ? (
                            <p className="mt-0.5 text-xs text-muted">{rider.notes}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-text">
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-brass" aria-hidden />
                            {rider.phone}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 text-xs font-semibold ${
                              rider.active
                                ? "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200"
                                : "border-border bg-stone text-muted"
                            }`}
                          >
                            {rider.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-text">
                          {formatCurrency(rider.default_cost)}
                        </td>
                        <td className="px-4 py-3.5">
                          {zoneEntries.length === 0 ? (
                            <span className="text-xs text-muted">Flat default rate</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {zoneEntries.slice(0, 4).map(([zoneId, cost]) => (
                                <span
                                  key={zoneId}
                                  className="rounded-[2px] border border-border bg-stone/60 px-2 py-0.5 text-xs text-text"
                                >
                                  {zoneNameById.get(zoneId) ?? "Zone"}:{" "}
                                  {formatCurrency(cost)}
                                </span>
                              ))}
                              {zoneEntries.length > 4 ? (
                                <span className="text-xs text-muted">
                                  +{zoneEntries.length - 4} more
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditRiderForm(rider)}
                              disabled={savingRider}
                              className="inline-flex h-9 items-center gap-1 rounded-[2px] border border-border px-2.5 text-xs font-medium text-text transition hover:border-brass hover:text-brass"
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleRiderActive(rider)}
                              disabled={savingRider}
                              title={rider.active ? "Deactivate rider" : "Activate rider"}
                              className="inline-flex h-9 items-center gap-1 rounded-[2px] border border-border px-2.5 text-xs font-medium text-muted transition hover:border-brass hover:text-text"
                            >
                              {rider.active ? (
                                <>
                                  <UserX className="h-3.5 w-3.5" aria-hidden />
                                  Pause
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" aria-hidden />
                                  Activate
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteRider(rider)}
                              disabled={savingRider}
                              aria-label={`Remove ${rider.name}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] border border-border text-muted transition hover:border-red-400 hover:text-red-600 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
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

      {/* ─── TAB 2: PRINTABLE DAILY DISPATCH SHEET ──────────── */}
      {activeTab === "dispatch" ? (
        <div className="space-y-5">
          {/* Controls (hidden when printing) */}
          <div className="flex flex-wrap items-end justify-between gap-4 border border-border bg-paper p-4 print:hidden">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1.5 text-sm text-muted">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-brass" aria-hidden />
                  Dispatch date (EAT)
                </span>
                <Input
                  type="date"
                  value={dispatchDate}
                  onChange={event => setDispatchDate(event.target.value)}
                />
              </label>

              <label className="space-y-1.5 text-sm text-muted">
                <span>Rider</span>
                <select
                  value={dispatchRiderFilter}
                  onChange={event => setDispatchRiderFilter(event.target.value)}
                  className="h-11 rounded-[2px] border border-text/20 bg-paper px-3.5 text-sm text-text outline-none transition focus:border-brass"
                >
                  <option value="">All riders</option>
                  {riders.map(rider => (
                    <option key={rider.id} value={rider.id}>
                      {rider.name}
                      {rider.active ? "" : " (inactive)"}
                    </option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
              </label>

              <label className="flex min-h-11 items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={includeConfirmed}
                  onChange={event => setIncludeConfirmed(event.target.checked)}
                  className="h-4 w-4 accent-brass"
                />
                <span>Include confirmed (ready to dispatch)</span>
              </label>

              <Button
                type="button"
                onClick={() =>
                  void loadDispatchSheet(dispatchDate, dispatchRiderFilter, includeConfirmed)
                }
                disabled={loadingDispatch}
              >
                {loadingDispatch ? "Loading..." : "Load sheet"}
              </Button>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={() => window.print()}
              disabled={dispatchSheet.totalOrders === 0}
            >
              <Printer className="mr-2 h-4 w-4" aria-hidden />
              Print dispatch sheet
            </Button>
          </div>

          {/* Print-only Header */}
          <div className="hidden border-b-2 border-black pb-3 print:block">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h1 className="font-serif text-2xl font-bold text-black">
                  AURO ARDON — DAILY DISPATCH SHEET
                </h1>
                <p className="text-xs text-black/80">
                  Date (EAT): {dispatchSheet.date} · Printed:{" "}
                  {formatNairobiDateTime(new Date())} EAT
                </p>
              </div>
              <div className="text-right text-xs text-black">
                <p className="font-semibold">
                  Orders: {dispatchSheet.totalOrders}
                </p>
                <p className="font-bold">
                  Total to collect: {formatCurrency(dispatchSheet.totalAmountToCollect)}
                </p>
              </div>
            </div>
          </div>

          {/* Summary KPI Strip */}
          <div className="grid gap-3 sm:grid-cols-3 print:grid-cols-3">
            <article className="border border-border bg-paper p-4 print:border-black/30 print:p-2.5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted print:text-black/70">
                Dispatched orders ({dispatchSheet.date})
              </p>
              <p className="mt-1.5 font-serif text-2xl text-text print:text-black">
                {dispatchSheet.totalOrders}
              </p>
            </article>
            <article className="border border-border bg-paper p-4 print:border-black/30 print:p-2.5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted print:text-black/70">
                Total amount to collect
              </p>
              <p className="mt-1.5 font-serif text-2xl font-semibold text-text print:text-black">
                {formatCurrency(dispatchSheet.totalAmountToCollect)}
              </p>
            </article>
            <article className="border border-border bg-paper p-4 print:border-black/30 print:p-2.5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted print:text-black/70">
                Rider delivery costs
              </p>
              <p className="mt-1.5 font-serif text-2xl text-text print:text-black">
                {formatCurrency(dispatchSheet.totalRiderCost)}
              </p>
            </article>
          </div>

          {dispatchSheet.totalOrders === 0 ? (
            <div className="border border-border bg-paper p-8 text-center print:hidden">
              <p className="font-serif text-xl text-text">
                No dispatched orders for {dispatchSheet.date}
              </p>
              <p className="mt-1 text-sm text-muted">
                Dispatch confirmed orders from the Orders page or enable &ldquo;Include confirmed&rdquo; to preview orders ready to go out.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {!includeConfirmed ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setIncludeConfirmed(true);
                      void loadDispatchSheet(dispatchDate, dispatchRiderFilter, true);
                    }}
                  >
                    Include confirmed orders
                  </Button>
                ) : null}
                <Link href="/admin/orders" className="btn-outline text-sm">
                  Go to orders
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {dispatchSheet.byRider.map(group => (
                <section
                  key={group.riderKey}
                  className="break-inside-avoid-page border border-border bg-paper print:border-black/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-stone/70 px-4 py-3 print:border-black/30 print:bg-neutral-100">
                    <div>
                      <h3 className="font-serif text-xl text-text print:text-black">
                        Rider: {group.riderName}
                      </h3>
                      <p className="text-xs text-muted print:text-black/80">
                        {group.riderPhone ? `${group.riderPhone} · ` : ""}
                        {group.orderCount}{" "}
                        {group.orderCount === 1 ? "delivery" : "deliveries"} · Rider
                        cost: {formatCurrency(group.totalRiderCost)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted print:text-black/70">
                        Rider total to collect
                      </p>
                      <p className="font-serif text-xl font-semibold text-text print:text-black">
                        {formatCurrency(group.totalToCollect)}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-[820px] w-full divide-y divide-border text-left text-xs sm:text-sm print:min-w-0 print:divide-black/25 print:text-[11px]">
                      <thead className="bg-stone/40 text-[11px] uppercase tracking-[0.1em] text-muted print:bg-neutral-50 print:text-black">
                        <tr>
                          <th className="px-3 py-2.5">Order no.</th>
                          <th className="px-3 py-2.5">Customer &amp; phone</th>
                          <th className="px-3 py-2.5">Zone &amp; address</th>
                          <th className="px-3 py-2.5">Items</th>
                          <th className="px-3 py-2.5 text-right">Amount to collect</th>
                          <th className="px-3 py-2.5">Rider</th>
                          <th className="px-3 py-2.5">Collection / Sign</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border print:divide-black/20">
                        {group.rows.map(row => (
                          <tr key={row.orderId} className="align-top">
                            <td className="px-3 py-3 font-semibold text-text print:text-black">
                              <Link
                                href={`/admin/orders?order=${row.orderId}`}
                                className="hover:text-brass hover:underline print:no-underline"
                              >
                                {row.orderNumber}
                              </Link>
                              <p className="mt-0.5 text-[11px] font-normal text-muted print:text-black/70">
                                {getCanonicalStatusLabel(row.status)}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-medium text-text print:text-black">
                                {row.customerName}
                              </p>
                              <p className="font-mono text-xs text-muted print:text-black/80">
                                {row.customerPhone}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-medium text-text print:text-black">
                                {row.deliveryZoneName}
                              </p>
                              <p className="text-xs text-muted print:text-black/80">
                                {row.address}
                                {row.townCounty ? ` (${row.townCounty})` : ""}
                              </p>
                              {row.isGift && row.hidePrices ? (
                                <p className="mt-0.5 text-[11px] font-semibold text-brass print:text-black">
                                  Gift — hide prices on slip
                                </p>
                              ) : null}
                              {row.notes ? (
                                <p className="mt-0.5 text-[11px] italic text-muted print:text-black/70">
                                  Note: {row.notes}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-xs text-text print:text-black">
                              {row.itemsSummary}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {row.amountToCollect === 0 ? (
                                <span className="inline-flex rounded-[2px] border border-emerald-400/50 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 print:border-black print:bg-transparent print:text-black">
                                  PAID (KES 0)
                                </span>
                              ) : (
                                <span className="font-semibold text-text print:text-black">
                                  {formatCurrency(row.amountToCollect)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-xs">
                              <p className="font-medium text-text print:text-black">
                                {row.riderName}
                              </p>
                              {row.riderPhone ? (
                                <p className="font-mono text-[11px] text-muted print:text-black/80">
                                  {row.riderPhone}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-[11px] text-muted print:text-black">
                              <p>&#9744; Cash &nbsp; &#9744; M-Pesa</p>
                              <p className="mt-1">Code: ______________</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ─── TAB 3: DELIVERY MARGIN REPORT ──────────────────── */}
      {activeTab === "margin" ? (
        <div className="space-y-6 print:hidden">
          <div className="flex flex-wrap items-end justify-between gap-4 border border-border bg-paper p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1.5 text-sm text-muted">
                <span>From (EAT)</span>
                <Input
                  type="date"
                  value={marginFrom}
                  onChange={event => setMarginFrom(event.target.value)}
                />
              </label>
              <label className="space-y-1.5 text-sm text-muted">
                <span>To (EAT)</span>
                <Input
                  type="date"
                  value={marginTo}
                  onChange={event => setMarginTo(event.target.value)}
                />
              </label>
              <Button
                type="button"
                onClick={() => void loadDeliveryMargin(marginFrom, marginTo)}
                disabled={loadingMargin}
              >
                {loadingMargin ? "Loading..." : "Load report"}
              </Button>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                window.location.assign(
                  `/api/admin/reports/delivery-margin?from=${encodeURIComponent(
                    marginReport.from
                  )}&to=${encodeURIComponent(marginReport.to)}&format=csv`
                )
              }
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          </div>

          {marginReport.ordersMissingRiderCost > 0 ? (
            <div
              role="status"
              className="flex items-start gap-2.5 border border-amber-400/50 bg-amber-50/60 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                <strong>{marginReport.ordersMissingRiderCost}</strong>{" "}
                {marginReport.ordersMissingRiderCost === 1 ? "order" : "orders"} in this
                range have no rider cost recorded yet. Assign a rider or delivery cost on
                those orders for exact delivery margin tracking.
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">
                Delivery fees charged
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatCurrency(marginReport.totalFeesCharged)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Across {marginReport.orderCount} delivery{" "}
                {marginReport.orderCount === 1 ? "order" : "orders"}
              </p>
            </article>

            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">
                Rider costs paid
              </p>
              <p className="mt-2 font-serif text-2xl text-text">
                {formatCurrency(marginReport.totalRiderCosts)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Recorded on {marginReport.ordersWithRiderCost} of{" "}
                {marginReport.orderCount} orders
              </p>
            </article>

            <article
              className={`border p-4 ${
                marginReport.netMargin >= 0
                  ? "border-emerald-400/50 bg-emerald-500/10"
                  : "border-red-400/50 bg-red-500/10"
              }`}
            >
              <p className="text-xs uppercase tracking-[0.14em] text-muted">
                Net delivery margin
              </p>
              <p
                className={`mt-2 font-serif text-2xl ${
                  marginReport.netMargin >= 0
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-red-700 dark:text-red-300"
                }`}
              >
                {marginReport.netMargin > 0
                  ? `+${formatCurrency(marginReport.netMargin)}`
                  : formatCurrency(marginReport.netMargin)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {marginReport.marginPercent !== null
                  ? `${marginReport.marginPercent.toFixed(1)}% of delivery fees charged`
                  : "No delivery fees charged"}
              </p>
            </article>

            <article className="border border-border bg-paper p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">
                Cost coverage
              </p>
              <p className="mt-2 flex items-center gap-2 font-serif text-2xl text-text">
                {marginReport.ordersMissingRiderCost === 0 && marginReport.orderCount > 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
                ) : null}
                {marginReport.orderCount > 0
                  ? `${Math.round(
                      (marginReport.ordersWithRiderCost / marginReport.orderCount) * 100
                    )}%`
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {marginReport.from} to {marginReport.to}
              </p>
            </article>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* By Zone */}
            <div className="border border-border bg-paper p-5">
              <h3 className="font-serif text-2xl text-text">Margin by delivery zone</h3>
              {marginReport.byZone.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  No dispatched or delivered orders in this date range.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto border border-border">
                  <table className="min-w-[460px] w-full divide-y divide-border text-left text-sm">
                    <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                      <tr>
                        <th className="px-3 py-2.5">Zone</th>
                        <th className="px-3 py-2.5 text-right">Orders</th>
                        <th className="px-3 py-2.5 text-right">Charged</th>
                        <th className="px-3 py-2.5 text-right">Rider cost</th>
                        <th className="px-3 py-2.5 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {marginReport.byZone.map(row => (
                        <tr key={row.zoneName}>
                          <td className="px-3 py-2.5 font-medium text-text">
                            {row.zoneName}
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted">
                            {row.orderCount}
                          </td>
                          <td className="px-3 py-2.5 text-right text-text">
                            {formatCurrency(row.feesCharged)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted">
                            {formatCurrency(row.riderCosts)}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right font-semibold ${
                              row.margin >= 0
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-red-700 dark:text-red-300"
                            }`}
                          >
                            {row.margin > 0
                              ? `+${formatCurrency(row.margin)}`
                              : formatCurrency(row.margin)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* By Rider */}
            <div className="border border-border bg-paper p-5">
              <h3 className="font-serif text-2xl text-text">Margin by rider</h3>
              {marginReport.byRider.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  No dispatched or delivered orders in this date range.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto border border-border">
                  <table className="min-w-[460px] w-full divide-y divide-border text-left text-sm">
                    <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                      <tr>
                        <th className="px-3 py-2.5">Rider</th>
                        <th className="px-3 py-2.5 text-right">Orders</th>
                        <th className="px-3 py-2.5 text-right">Charged</th>
                        <th className="px-3 py-2.5 text-right">Rider cost</th>
                        <th className="px-3 py-2.5 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {marginReport.byRider.map(row => (
                        <tr key={row.riderId ?? row.riderName}>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-text">{row.riderName}</p>
                            {row.riderPhone ? (
                              <p className="text-xs text-muted">{row.riderPhone}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted">
                            {row.orderCount}
                          </td>
                          <td className="px-3 py-2.5 text-right text-text">
                            {formatCurrency(row.feesCharged)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted">
                            {formatCurrency(row.riderCosts)}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right font-semibold ${
                              row.margin >= 0
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-red-700 dark:text-red-300"
                            }`}
                          >
                            {row.margin > 0
                              ? `+${formatCurrency(row.margin)}`
                              : formatCurrency(row.margin)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Order Detail Breakdown */}
          {marginReport.orders.length > 0 ? (
            <div className="border border-border bg-paper p-5">
              <h3 className="font-serif text-2xl text-text">Order delivery breakdown</h3>
              <div className="mt-4 overflow-x-auto border border-border">
                <table className="min-w-[740px] w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-3 py-2.5">Order</th>
                      <th className="px-3 py-2.5">Customer</th>
                      <th className="px-3 py-2.5">Zone</th>
                      <th className="px-3 py-2.5">Rider</th>
                      <th className="px-3 py-2.5 text-right">Fee charged</th>
                      <th className="px-3 py-2.5 text-right">Rider cost</th>
                      <th className="px-3 py-2.5 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {marginReport.orders.map(row => (
                      <tr key={row.orderId} className="hover:bg-stone/40">
                        <td className="px-3 py-2.5 font-semibold text-text">
                          <Link
                            href={`/admin/orders?order=${row.orderId}`}
                            className="hover:text-brass hover:underline"
                          >
                            {row.orderNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-text">{row.customerName}</td>
                        <td className="px-3 py-2.5 text-muted">{row.zoneName}</td>
                        <td className="px-3 py-2.5 text-muted">{row.riderName}</td>
                        <td className="px-3 py-2.5 text-right text-text">
                          {formatCurrency(row.deliveryFeeCharged)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted">
                          {formatCurrency(row.riderCost)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right font-semibold ${
                            row.margin >= 0
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-red-700 dark:text-red-300"
                          }`}
                        >
                          {row.margin > 0
                            ? `+${formatCurrency(row.margin)}`
                            : formatCurrency(row.margin)}
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
    </div>
  );
}

