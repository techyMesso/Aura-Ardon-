"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProductCsvDryRunSummary } from "@/lib/product-csv";

interface ProductCsvImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function ProductCsvImportModal({
  open,
  onClose,
  onImported
}: ProductCsvImportModalProps) {
  const [csvText, setCsvText] = useState("");
  const [stockNote, setStockNote] = useState("CSV catalog stock sync");
  const [summary, setSummary] = useState<ProductCsvDryRunSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!open) return null;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setSummary(null);
    setError(null);
    setSuccess(null);
    event.target.value = "";
  }

  async function runPreview() {
    if (!csvText.trim()) {
      setError("Upload or paste CSV rows first.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, mode: "dry_run" })
      });
      const data = (await res.json()) as {
        summary?: ProductCsvDryRunSummary;
        error?: string;
      };
      if (!res.ok || !data.summary) {
        throw new Error(data.error ?? "Unable to preview CSV.");
      }
      setSummary(data.summary);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Preview failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyImport() {
    if (!summary || summary.errorCount > 0) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          mode: "apply",
          stockNote: stockNote.trim()
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        created?: number;
        updated?: number;
        stockAdjusted?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Import failed.");
      }
      setSuccess(
        `Imported cleanly: ${data.created ?? 0} created, ${data.updated ?? 0} updated, ${data.stockAdjusted ?? 0} stock ledger adjustment(s).`
      );
      onImported();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Import failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import products CSV"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/70 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto border border-border bg-paper p-5 text-text shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brass">
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Bulk CSV import
            </p>
            <h3 className="mt-1 font-serif text-2xl text-text">
              Dry-run preview &amp; import
            </h3>
            <p className="mt-1 text-xs text-muted">
              Tip: Export your existing products CSV first for the exact column format. Existing rows match by <code>slug</code>; stock differences are recorded through the stock ledger.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close CSV import dialog"
            className="flex h-9 w-9 items-center justify-center rounded-[2px] text-muted hover:bg-stone hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-outline cursor-pointer text-xs">
              <Upload className="h-3.5 w-3.5" aria-hidden />
              Choose .csv file
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={e => void handleFileChange(e)}
              />
            </label>
            <span className="text-xs text-muted">
              Separate multiple image URLs and alt texts with <code> | </code>.
            </span>
          </div>

          <Textarea
            rows={6}
            placeholder="Paste CSV content here (including header row)..."
            value={csvText}
            onChange={e => {
              setCsvText(e.target.value);
              setSummary(null);
              setSuccess(null);
            }}
            className="font-mono text-xs"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !csvText.trim()}
              onClick={() => void runPreview()}
            >
              {busy ? "Checking..." : "Run dry-run preview"}
            </Button>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-[2px] border border-red-400/50 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          ) : null}

          {success ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-[2px] border border-emerald-400/50 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              {success}
            </p>
          ) : null}

          {summary ? (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="border border-border bg-stone/50 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted">Create</p>
                  <p className="mt-1 font-serif text-2xl text-text">{summary.createCount}</p>
                </div>
                <div className="border border-border bg-stone/50 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted">Update</p>
                  <p className="mt-1 font-serif text-2xl text-text">{summary.updateCount}</p>
                </div>
                <div className="border border-border bg-stone/50 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted">Ledger deltas</p>
                  <p className="mt-1 font-serif text-2xl text-text">{summary.stockAdjustCount}</p>
                </div>
                <div className="border border-border bg-stone/50 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted">Errors</p>
                  <p
                    className={`mt-1 font-serif text-2xl ${
                      summary.errorCount > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {summary.errorCount}
                  </p>
                </div>
              </div>

              <div className="max-h-64 overflow-auto border border-border">
                <table className="min-w-[600px] w-full divide-y divide-border text-left text-xs">
                  <thead className="bg-stone uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Slug / Title</th>
                      <th className="px-3 py-2">Stock</th>
                      <th className="px-3 py-2">Notes &amp; errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {summary.rows.map(row => (
                      <tr key={row.rowNumber}>
                        <td className="px-3 py-2 text-muted">#{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-[2px] px-2 py-0.5 font-semibold uppercase ${
                              row.action === "error"
                                ? "bg-red-500/15 text-red-700 dark:text-red-300"
                                : row.action === "create"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-brass/20 text-text"
                            }`}
                          >
                            {row.action}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-text">{row.title || "—"}</p>
                          <p className="font-mono text-[11px] text-muted">{row.slug || "—"}</p>
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {row.action === "update" && row.stockDelta !== 0
                            ? `${row.currentStock} → ${row.targetStock} (${row.stockDelta > 0 ? `+${row.stockDelta}` : row.stockDelta})`
                            : row.targetStock ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.errors.map(err => (
                            <p
                              key={err}
                              className="flex items-start gap-1 text-red-600 dark:text-red-400"
                            >
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              {err}
                            </p>
                          ))}
                          {row.warnings.map(warn => (
                            <p key={warn} className="text-muted">
                              {warn}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {summary.stockAdjustCount > 0 ? (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-text">
                    Stock ledger note (required for stock changes) <span className="text-brass">*</span>
                  </span>
                  <Input
                    value={stockNote}
                    onChange={e => setStockNote(e.target.value)}
                    placeholder="e.g. Monthly studio stocktake CSV sync"
                  />
                </label>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button
                  type="button"
                  disabled={
                    busy ||
                    summary.errorCount > 0 ||
                    (summary.createCount === 0 && summary.updateCount === 0)
                  }
                  onClick={() => void applyImport()}
                >
                  {busy
                    ? "Applying..."
                    : `Confirm & apply (${summary.createCount + summary.updateCount} rows)`}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

