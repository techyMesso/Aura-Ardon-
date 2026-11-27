"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Edit3,
  MapPin,
  Plus,
  Trash2,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DELIVERY_ZONE_MAX_FEE,
  DELIVERY_ZONE_MIN_FEE,
  normalizeDeliveryZoneName
} from "@/lib/delivery-zones";
import type { AdminDeliveryZone } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface DeliveryZonesManagerProps {
  initialZones: AdminDeliveryZone[];
}

interface ZoneDraft {
  name: string;
  fee: string;
  active: boolean;
  is_outside_nairobi: boolean;
}

const EMPTY_DRAFT: ZoneDraft = {
  name: "",
  fee: "250",
  active: true,
  is_outside_nairobi: false
};

function parseFeeInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (
    !Number.isInteger(value) ||
    value < DELIVERY_ZONE_MIN_FEE ||
    value > DELIVERY_ZONE_MAX_FEE
  ) {
    return null;
  }
  return value;
}

export function DeliveryZonesManager({ initialZones }: DeliveryZonesManagerProps) {
  const [zones, setZones] = useState<AdminDeliveryZone[]>(initialZones);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createDraft, setCreateDraft] = useState<ZoneDraft>(EMPTY_DRAFT);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ZoneDraft>(EMPTY_DRAFT);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeCount = zones.filter(zone => zone.active).length;

  function validateDraft(draft: ZoneDraft, excludeId?: string): {
    name: string;
    fee: number;
  } | null {
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setError("Zone name is required.");
      return null;
    }
    if (trimmedName.length > 80) {
      setError("Zone name must be 80 characters or fewer.");
      return null;
    }

    const normalized = normalizeDeliveryZoneName(trimmedName);
    const duplicate = zones.some(
      zone =>
        zone.id !== excludeId && normalizeDeliveryZoneName(zone.name) === normalized
    );
    if (duplicate) {
      setError(`A delivery zone named "${trimmedName}" already exists.`);
      return null;
    }

    const parsedFee = parseFeeInput(draft.fee);
    if (parsedFee === null) {
      setError(
        `Delivery fee must be a whole integer between KES ${DELIVERY_ZONE_MIN_FEE} and KES ${DELIVERY_ZONE_MAX_FEE.toLocaleString("en-KE")}.`
      );
      return null;
    }

    return { name: trimmedName, fee: parsedFee };
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validated = validateDraft(createDraft);
    if (!validated) return;

    setBusyKey("create");
    try {
      const response = await fetch("/api/admin/delivery-zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: validated.name,
          fee: validated.fee,
          active: createDraft.active,
          is_outside_nairobi: createDraft.is_outside_nairobi
        })
      });
      const payload = (await response.json()) as {
        zone?: AdminDeliveryZone;
        error?: string;
      };
      if (!response.ok || !payload.zone) {
        throw new Error(payload.error ?? "Unable to create delivery zone.");
      }

      setZones(current => [...current, payload.zone!]);
      setCreateDraft(EMPTY_DRAFT);
      setShowCreateForm(false);
      setSuccess(`Added delivery zone "${payload.zone.name}" (${formatCurrency(payload.zone.fee)}).`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create delivery zone."
      );
    } finally {
      setBusyKey(null);
    }
  }

  function startEditing(zone: AdminDeliveryZone) {
    setError(null);
    setSuccess(null);
    setEditingId(zone.id);
    setEditDraft({
      name: zone.name,
      fee: String(Math.round(zone.fee)),
      active: zone.active,
      is_outside_nairobi: zone.is_outside_nairobi
    });
  }

  async function handleSaveEdit(zoneId: string) {
    setError(null);
    setSuccess(null);

    const validated = validateDraft(editDraft, zoneId);
    if (!validated) return;

    setBusyKey(`edit:${zoneId}`);
    try {
      const response = await fetch(`/api/admin/delivery-zones/${zoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: validated.name,
          fee: validated.fee,
          active: editDraft.active,
          is_outside_nairobi: editDraft.is_outside_nairobi
        })
      });
      const payload = (await response.json()) as {
        zone?: AdminDeliveryZone;
        error?: string;
      };
      if (!response.ok || !payload.zone) {
        throw new Error(payload.error ?? "Unable to update delivery zone.");
      }

      setZones(current =>
        current.map(zone => (zone.id === zoneId ? payload.zone! : zone))
      );
      setEditingId(null);
      setSuccess(
        `Saved "${payload.zone.name}" (${formatCurrency(payload.zone.fee)}). Checkout, Delivery Info, and FAQ have been refreshed.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update delivery zone."
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleToggleActive(zone: AdminDeliveryZone) {
    setError(null);
    setSuccess(null);
    setBusyKey(`toggle:${zone.id}`);

    try {
      const nextActive = !zone.active;
      const response = await fetch(`/api/admin/delivery-zones/${zone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive })
      });
      const payload = (await response.json()) as {
        zone?: AdminDeliveryZone;
        error?: string;
      };
      if (!response.ok || !payload.zone) {
        throw new Error(payload.error ?? "Unable to change delivery zone status.");
      }

      setZones(current =>
        current.map(item => (item.id === zone.id ? payload.zone! : item))
      );
      setSuccess(
        nextActive
          ? `Reactivated "${zone.name}" for checkout.`
          : `Deactivated "${zone.name}". Existing orders keep their recorded delivery fee.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to change delivery zone status."
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= zones.length) return;

    setError(null);
    setSuccess(null);

    const nextZones = [...zones];
    const [moved] = nextZones.splice(index, 1);
    nextZones.splice(targetIndex, 0, moved);

    const orderedIds = nextZones.map(zone => zone.id);
    setBusyKey(`move:${moved.id}`);

    try {
      const response = await fetch("/api/admin/delivery-zones/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds })
      });
      const payload = (await response.json()) as {
        zones?: AdminDeliveryZone[];
        error?: string;
      };
      if (!response.ok || !payload.zones) {
        throw new Error(payload.error ?? "Unable to reorder delivery zones.");
      }

      setZones(payload.zones);
      setSuccess(`Updated sort order for "${moved.name}".`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to reorder delivery zones."
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(zone: AdminDeliveryZone) {
    if (zone.order_count > 0) {
      setError(
        `"${zone.name}" is referenced by ${zone.order_count} order(s) and cannot be deleted. Deactivate it instead.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete unused delivery zone "${zone.name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setError(null);
    setSuccess(null);
    setBusyKey(`delete:${zone.id}`);

    try {
      const response = await fetch(`/api/admin/delivery-zones/${zone.id}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to delete delivery zone.");
      }

      setZones(current => current.filter(item => item.id !== zone.id));
      setSuccess(`Deleted unused delivery zone "${zone.name}".`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to delete delivery zone."
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section
      id="delivery-zones"
      aria-label="Delivery zones"
      className="space-y-4 border border-border bg-paper p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-brass" aria-hidden />
            <h3 className="font-serif text-2xl text-text">Delivery zones</h3>
          </div>
          <p className="mt-1 text-sm text-muted">
            Owner-only editor for Nairobi &amp; courier delivery fees. Updates immediately refresh checkout, Delivery Info, and FAQ without changing fees on past orders or invoices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-[2px] border border-border bg-stone/60 px-2.5 py-1 text-xs font-medium text-text">
            {activeCount} active · {zones.length} total
          </span>
          <Button
            type="button"
            variant={showCreateForm ? "ghost" : "default"}
            disabled={busyKey !== null}
            onClick={() => {
              setShowCreateForm(current => !current);
              setError(null);
              setSuccess(null);
            }}
          >
            {showCreateForm ? (
              <>
                <X className="mr-1.5 h-4 w-4" aria-hidden />
                Close form
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                Add zone
              </>
            )}
          </Button>
        </div>
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

      {showCreateForm ? (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-[2px] border border-brass/50 bg-stone/40 p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brass">
            New delivery zone
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Zone name</span>
              <Input
                placeholder="e.g. Gigiri, Rosslyn, or Mombasa Courier"
                maxLength={80}
                required
                value={createDraft.name}
                onChange={event =>
                  setCreateDraft(current => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">
                Delivery fee (KES, whole integer 0–10,000)
              </span>
              <Input
                type="number"
                min={DELIVERY_ZONE_MIN_FEE}
                max={DELIVERY_ZONE_MAX_FEE}
                step={1}
                required
                value={createDraft.fee}
                onChange={event =>
                  setCreateDraft(current => ({ ...current, fee: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-5 text-sm">
            <label className="inline-flex items-center gap-2 text-text">
              <input
                type="checkbox"
                checked={createDraft.is_outside_nairobi}
                onChange={event =>
                  setCreateDraft(current => ({
                    ...current,
                    is_outside_nairobi: event.target.checked
                  }))
                }
                className="h-4 w-4 accent-brass"
              />
              <span>Requires town / county (Outside Nairobi)</span>
            </label>

            <label className="inline-flex items-center gap-2 text-text">
              <input
                type="checkbox"
                checked={createDraft.active}
                onChange={event =>
                  setCreateDraft(current => ({
                    ...current,
                    active: event.target.checked
                  }))
                }
                className="h-4 w-4 accent-brass"
              />
              <span>Active at checkout</span>
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busyKey === "create"}
              onClick={() => {
                setShowCreateForm(false);
                setCreateDraft(EMPTY_DRAFT);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busyKey === "create"}>
              {busyKey === "create" ? "Adding zone..." : "Add delivery zone"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto border border-border">
        <table className="min-w-[700px] w-full divide-y divide-border text-left text-sm">
          <thead className="bg-stone text-xs uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-3 py-2.5 w-24">Order</th>
              <th className="px-3 py-2.5">Zone</th>
              <th className="px-3 py-2.5 text-right w-32">Fee (KES)</th>
              <th className="px-3 py-2.5 w-40">Town / county</th>
              <th className="px-3 py-2.5 w-28">Status</th>
              <th className="px-3 py-2.5 text-right w-44">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {zones.map((zone, index) => {
              const isEditing = editingId === zone.id;
              const rowBusy = busyKey !== null;

              if (isEditing) {
                return (
                  <tr key={zone.id} className="bg-stone/40">
                    <td className="px-3 py-3 text-xs font-mono text-muted">
                      #{index + 1}
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        aria-label="Edit zone name"
                        maxLength={80}
                        value={editDraft.name}
                        onChange={event =>
                          setEditDraft(current => ({
                            ...current,
                            name: event.target.value
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        type="number"
                        aria-label="Edit delivery fee KES"
                        min={DELIVERY_ZONE_MIN_FEE}
                        max={DELIVERY_ZONE_MAX_FEE}
                        step={1}
                        value={editDraft.fee}
                        onChange={event =>
                          setEditDraft(current => ({
                            ...current,
                            fee: event.target.value
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-2 text-xs text-text">
                        <input
                          type="checkbox"
                          checked={editDraft.is_outside_nairobi}
                          onChange={event =>
                            setEditDraft(current => ({
                              ...current,
                              is_outside_nairobi: event.target.checked
                            }))
                          }
                          className="h-4 w-4 accent-brass"
                        />
                        <span>Required</span>
                      </label>
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-2 text-xs text-text">
                        <input
                          type="checkbox"
                          checked={editDraft.active}
                          onChange={event =>
                            setEditDraft(current => ({
                              ...current,
                              active: event.target.checked
                            }))
                          }
                          className="h-4 w-4 accent-brass"
                        />
                        <span>Active</span>
                      </label>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          type="button"
                          disabled={rowBusy}
                          className="h-8 px-2.5 text-xs"
                          onClick={() => void handleSaveEdit(zone.id)}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                          {busyKey === `edit:${zone.id}` ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={rowBusy}
                          className="h-8 px-2.5 text-xs"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={zone.id}
                  className={zone.active ? "bg-paper" : "bg-stone/30 opacity-75"}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <span className="w-6 font-mono text-xs text-muted">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        aria-label={`Move ${zone.name} up`}
                        disabled={rowBusy || index === 0}
                        onClick={() => void handleMove(index, -1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-border bg-paper text-muted transition hover:border-brass hover:text-text disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${zone.name} down`}
                        disabled={rowBusy || index === zones.length - 1}
                        onClick={() => void handleMove(index, 1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-border bg-paper text-muted transition hover:border-brass hover:text-text disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </td>

                  <td className="px-3 py-2.5">
                    <p className="font-medium text-text">{zone.name}</p>
                    <p className="text-[11px] text-muted">
                      {zone.order_count > 0
                        ? `Referenced by ${zone.order_count} order${zone.order_count === 1 ? "" : "s"}`
                        : "No orders yet"}
                    </p>
                  </td>

                  <td className="px-3 py-2.5 text-right font-mono font-medium text-text">
                    {formatCurrency(zone.fee)}
                  </td>

                  <td className="px-3 py-2.5">
                    {zone.is_outside_nairobi ? (
                      <span className="inline-flex rounded-[2px] border border-brass/50 bg-brass/10 px-2 py-0.5 text-xs font-medium text-text">
                        Requires town/county
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Nairobi zone</span>
                    )}
                  </td>

                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={rowBusy}
                      aria-label={
                        zone.active
                          ? `Deactivate ${zone.name}`
                          : `Reactivate ${zone.name}`
                      }
                      onClick={() => void handleToggleActive(zone)}
                      className={`inline-flex items-center rounded-[2px] border px-2.5 py-1 text-xs font-semibold transition ${
                        zone.active
                          ? "border-emerald-300 bg-emerald-100 text-emerald-950 hover:bg-emerald-200 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200"
                          : "border-border bg-stone text-muted hover:border-brass hover:text-text"
                      }`}
                    >
                      {busyKey === `toggle:${zone.id}`
                        ? "Saving..."
                        : zone.active
                          ? "Active"
                          : "Inactive"}
                    </button>
                  </td>

                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={rowBusy}
                        className="h-8 px-2.5 text-xs"
                        onClick={() => startEditing(zone)}
                      >
                        <Edit3 className="mr-1 h-3.5 w-3.5" aria-hidden />
                        Edit
                      </Button>
                      {zone.order_count === 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={rowBusy}
                          aria-label={`Delete unused zone ${zone.name}`}
                          onClick={() => void handleDelete(zone)}
                          className="h-8 px-2 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      ) : (
                        <span
                          title="Zones referenced by orders cannot be deleted. Use the status toggle to deactivate."
                          className="px-1.5 text-[11px] text-muted"
                        >
                          Locked
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Zones used by existing orders cannot be hard-deleted — toggle them to{" "}
        <strong>Inactive</strong> instead so historical order records and invoices stay intact.
      </p>
    </section>
  );
}

