"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { StockIntegrityDiscrepancy } from "@/lib/types";

interface IntegrityResult {
  ok: boolean;
  totalProducts: number;
  discrepancies: StockIntegrityDiscrepancy[];
  checkedAt: string;
}

export function StockIntegrityPanel() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<IntegrityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/stock/integrity");
      const payload = (await response.json()) as IntegrityResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to check stock integrity.");
      }
      setResult(payload);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to check stock integrity."
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="border border-border bg-stone/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brass" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-text">Stock ledger integrity check</p>
            <p className="text-xs text-muted">
              Verifies that every product&apos;s live stock equals the exact sum of its stock ledger movements.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void runCheck()}
          disabled={checking}
          className="shrink-0"
        >
          {checking ? "Checking..." : "Run integrity check"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {result ? (
        result.ok ? (
          <div
            role="status"
            className="mt-3 flex items-center gap-2 rounded-[2px] border border-emerald-400/50 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              All {result.totalProducts} products match their stock ledger (0 discrepancies).
            </span>
          </div>
        ) : (
          <div
            role="alert"
            className="mt-3 space-y-2 rounded-[2px] border border-red-400/50 bg-red-500/10 p-3.5 text-sm text-red-700 dark:text-red-300"
          >
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                Found {result.discrepancies.length} stock{" "}
                {result.discrepancies.length === 1 ? "discrepancy" : "discrepancies"}
              </span>
            </div>
            <ul className="space-y-1 text-xs">
              {result.discrepancies.map(row => (
                <li key={row.product_id} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/products/${row.product_id}/edit`}
                    className="font-semibold underline underline-offset-2"
                  >
                    {row.product_title}
                  </Link>
                  <span>
                    Recorded: {row.recorded_stock} · Ledger sum: {row.ledger_sum} (diff{" "}
                    {row.discrepancy > 0 ? `+${row.discrepancy}` : row.discrepancy})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}

