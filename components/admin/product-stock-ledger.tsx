"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, History, PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STOCK_MOVEMENT_LABELS } from "@/lib/admin-orders";
import type { StockMovement } from "@/lib/types";

interface ProductStockLedgerProps {
  productId: string;
  initialStock: number;
  initialLedgerSum: number;
  initialMovements: StockMovement[];
  hasVariants?: boolean;
}

function formatNairobiDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function ProductStockLedger({
  productId,
  initialStock,
  initialLedgerSum,
  initialMovements,
  hasVariants = false
}: ProductStockLedgerProps) {
  const [stock, setStock] = useState(initialStock);
  const [ledgerSum, setLedgerSum] = useState(initialLedgerSum);
  const [movements, setMovements] = useState<StockMovement[]>(initialMovements);
  const [adjustmentType, setAdjustmentType] = useState<
    "manual_adjustment" | "damaged_writeoff"
  >("manual_adjustment");
  const [changeValue, setChangeValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isConsistent = stock === ledgerSum;

  async function handleAdjustSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setError(null);
    setSuccess(null);

    const parsedChange = Number.parseInt(changeValue, 10);
    if (!Number.isInteger(parsedChange) || parsedChange === 0) {
      setError("Enter a non-zero whole number (e.g. 5 to add stock or -2 to deduct).");
      return;
    }

    if (adjustmentType === "damaged_writeoff" && parsedChange > 0) {
      setError("Damaged write-offs must use a negative quantity (e.g. -1).");
      return;
    }

    if (note.trim().length < 2) {
      setError("A note explaining this stock adjustment is required.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/products/${productId}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          change: parsedChange,
          note: note.trim(),
          type: adjustmentType
        })
      });
      const payload = (await response.json()) as {
        newStockQuantity?: number;
        ledgerSum?: number;
        movements?: StockMovement[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to record stock adjustment.");
      }

      if (typeof payload.newStockQuantity === "number") {
        setStock(payload.newStockQuantity);
      }
      if (typeof payload.ledgerSum === "number") {
        setLedgerSum(payload.ledgerSum);
      }
      if (Array.isArray(payload.movements)) {
        setMovements(payload.movements);
      }

      setChangeValue("");
      setNote("");
      setSuccess(
        `Stock updated (${parsedChange > 0 ? `+${parsedChange}` : parsedChange}). Current stock: ${
          payload.newStockQuantity ?? stock + parsedChange
        }.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to record stock adjustment."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="mt-8 space-y-6 border border-border bg-paper p-4 sm:p-6"
      aria-labelledby="stock-ledger-heading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brass">Stock ledger</p>
          <h3 id="stock-ledger-heading" className="mt-1 font-serif text-2xl text-text">
            Stock history & manual adjustments
          </h3>
          <p className="mt-1 text-sm text-muted">
            Every stock movement is permanent. Manual edits require a note and append a ledger entry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-[2px] border border-border bg-stone px-3.5 py-2 text-sm">
            <span className="text-muted">Current stock: </span>
            <strong className="text-text">{stock}</strong>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-2 text-xs font-semibold ${
              isConsistent
                ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-red-400/50 bg-red-500/10 text-red-700 dark:text-red-300"
            }`}
          >
            {isConsistent ? (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Ledger balanced ({ledgerSum})
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4" aria-hidden />
                Discrepancy (ledger sum {ledgerSum})
              </>
            )}
          </div>
        </div>
      </div>

      {/* Manual Adjustment Form */}
      {hasVariants ? (
        <div className="rounded-[2px] border border-brass/30 bg-stone/50 p-4 text-sm text-muted">
          This product tracks inventory per variant. Use the <strong className="text-text">Adjust stock</strong> controls in the <strong className="text-text">Optional variants</strong> section above — every variant movement appears in this unified ledger below.
        </div>
      ) : (
      <form
        onSubmit={handleAdjustSubmit}
        className="space-y-4 rounded-[2px] border border-brass/30 bg-stone/50 p-4"
      >
        <div className="flex items-center gap-2">
          <PlusCircle className="h-4 w-4 text-brass" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
            Record manual adjustment
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[180px_140px_1fr]">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-text">Type</span>
            <select
              value={adjustmentType}
              onChange={event =>
                setAdjustmentType(
                  event.target.value as "manual_adjustment" | "damaged_writeoff"
                )
              }
              className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text outline-none transition focus:border-brass"
            >
              <option value="manual_adjustment">Manual adjustment</option>
              <option value="damaged_writeoff">Damaged write-off</option>
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-text">
              Change (±) <span className="text-brass">*</span>
            </span>
            <Input
              type="number"
              step={1}
              placeholder={adjustmentType === "damaged_writeoff" ? "-1" : "+5 or -2"}
              value={changeValue}
              onChange={event => setChangeValue(event.target.value)}
              required
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-text">
              Note <span className="text-brass">*</span>
            </span>
            <Input
              type="text"
              placeholder="e.g. New studio restock, physical count correction, damaged display piece"
              value={note}
              onChange={event => setNote(event.target.value)}
              required
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {adjustmentType === "manual_adjustment" ? (
              <>
                {[1, 5, 10, -1, -5].map(delta => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => setChangeValue(String(delta))}
                    className="rounded-[2px] border border-border bg-paper px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brass hover:text-text"
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </>
            ) : (
              [-1, -2, -5].map(delta => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => setChangeValue(String(delta))}
                  className="rounded-[2px] border border-border bg-paper px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brass hover:text-text"
                >
                  {delta}
                </button>
              ))
            )}
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Recording..." : "Apply stock adjustment"}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        {success ? (
          <p aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">
            {success}
          </p>
        ) : null}
      </form>
      )}

      {/* Stock History Table */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-brass" aria-hidden />
          <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">
            Movement history ({movements.length})
          </h4>
        </div>

        {movements.length === 0 ? (
          <p className="rounded-[2px] border border-dashed border-border bg-stone/40 p-6 text-center text-sm text-muted">
            No stock movements recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="min-w-[680px] w-full divide-y divide-border text-sm">
              <thead className="bg-stone text-left text-xs uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-4 py-3">Date (EAT)</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-paper">
                {movements.map(movement => (
                  <tr key={movement.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {formatNairobiDateTime(movement.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-text">
                      {STOCK_MOVEMENT_LABELS[movement.type] ?? movement.type}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${
                        movement.change > 0
                          ? "text-emerald-700 dark:text-emerald-300"
                          : movement.change < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-muted"
                      }`}
                    >
                      {movement.change > 0 ? `+${movement.change}` : movement.change}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {movement.order_id ? (
                        <Link
                          href={`/admin/orders?order=${movement.order_id}`}
                          className="font-medium text-brass underline-offset-4 hover:underline"
                        >
                          {movement.order_number ?? `#${movement.order_id.slice(0, 8)}`}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="max-w-xs break-words px-4 py-3 text-muted">
                      {movement.note || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                      {movement.created_by}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

