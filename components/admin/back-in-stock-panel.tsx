"use client";

import { useState } from "react";
import { Bell, CheckCircle2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildBackInStockWhatsAppUrl } from "@/lib/product-csv";
import type { BackInStockAlert, StoreSettings } from "@/lib/types";

interface BackInStockPanelProps {
  initialAlerts: BackInStockAlert[];
  storeSettings: Pick<StoreSettings, "site_name" | "message_templates">;
  title?: string;
  compact?: boolean;
}

export function BackInStockPanel({
  initialAlerts,
  storeSettings,
  title = "Back-in-stock WhatsApp waitlist",
  compact = false
}: BackInStockPanelProps) {
  const [alerts, setAlerts] = useState<BackInStockAlert[]>(initialAlerts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const waitingAlerts = alerts.filter(a => a.status === "waiting");

  if (waitingAlerts.length === 0) {
    if (compact) return null;
    return (
      <section className="mt-8 border border-border bg-paper p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-brass" aria-hidden />
          <h3 className="font-serif text-xl text-text">{title}</h3>
        </div>
        <p className="mt-2 text-sm text-muted">
          No shoppers are currently waiting for this piece to be restocked.
        </p>
      </section>
    );
  }

  async function markNotified(alertId: string) {
    setBusyId(alertId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/back-in-stock/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "notified" })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update alert.");
      }
      setAlerts(current =>
        current.map(item =>
          item.id === alertId
            ? { ...item, status: "notified", notified_at: new Date().toISOString() }
            : item
        )
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to mark alert as notified."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      aria-label={title}
      className={
        compact
          ? "border border-emerald-400/50 bg-emerald-500/10 p-4 text-sm"
          : "mt-8 space-y-4 border border-border bg-paper p-4 sm:p-6"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-brass" aria-hidden />
          <h3 className={compact ? "font-semibold text-text" : "font-serif text-2xl text-text"}>
            {title} ({waitingAlerts.length})
          </h3>
        </div>
        <p className="text-xs text-muted">
          Click WhatsApp to message each shopper, then mark as notified.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <ul className="mt-3 divide-y divide-border border border-border bg-paper">
        {waitingAlerts.map(alert => {
          const waUrl = buildBackInStockWhatsAppUrl(alert, storeSettings);
          const availableStock =
            alert.variant_id != null
              ? (alert.variant_stock ?? 0)
              : (alert.product_stock ?? 0);
          const isReady = availableStock > 0;

          return (
            <li
              key={alert.id}
              className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-text">
                  {alert.product_title}
                  {alert.variant_name ? ` — ${alert.variant_name}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {alert.customer_name ? `${alert.customer_name} · ` : ""}
                  +{alert.phone}
                  {" · "}
                  <span
                    className={
                      isReady
                        ? "font-semibold text-emerald-700 dark:text-emerald-300"
                        : "text-muted"
                    }
                  >
                    {isReady
                      ? `In stock (${availableStock} available)`
                      : "Still out of stock"}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary min-h-9 px-3 py-1.5 text-xs"
                  >
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                    Message on WhatsApp
                  </a>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busyId === alert.id}
                  onClick={() => void markNotified(alert.id)}
                  className="min-h-9 px-3 text-xs"
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                  {busyId === alert.id ? "Saving..." : "Mark notified"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

