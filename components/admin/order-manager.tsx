"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/types";

interface OrderManagerProps {
  initialOrders: Order[];
}

// New status values per prompt: new, confirmed, delivered, cancelled
const statuses: OrderStatus[] = ["new", "confirmed", "delivered", "cancelled"];

export function OrderManager({ initialOrders }: OrderManagerProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(id: string, status: OrderStatus) {
    setSavingId(id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const payload = (await response.json()) as { order?: Order; error?: string };

      if (!response.ok || !payload.order) {
        throw new Error(payload.error ?? "Unable to update order.");
      }

      setOrders((current) =>
        current.map((order) => (order.id === id ? payload.order! : order))
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update order."
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/50 bg-white/70 p-6 shadow-luxe backdrop-blur">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">
          Orders
        </p>
        <h2 className="font-serif text-3xl text-ink">M-Pesa reconciliation</h2>
        <p className="mt-2 text-sm text-muted">
          Review pending callbacks, confirm receipt numbers, and advance fulfillment.
        </p>
      </div>
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-hidden rounded-[1.5rem] border border-border">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-sand/50 text-left uppercase tracking-[0.18em] text-muted">
              <tr>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white/80">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-4 text-muted">
                    {new Date(order.created_at).toLocaleString("en-KE")}
                  </td>
                  <td className="px-4 py-4 font-medium text-ink">
                    {order.customer_phone}
                  </td>
                   <td className="px-4 py-4 text-muted">
                    {formatCurrency(order.total)}
                  </td>
                  <td className="px-4 py-4 text-muted">
                    {order.mpesa_receipt_number ?? "Awaiting callback"}
                  </td>
                   <td className="px-4 py-4">
                    <Badge>{order.order_status}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {statuses.map((status) => (
                        <Button
                          key={status}
                          variant={order.order_status === status ? "secondary" : "ghost"}
                          disabled={savingId === order.id}
                          onClick={() => void updateStatus(order.id, status)}
                        >
                          {status}
                        </Button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {statuses.map((status) => (
                        <Button
                          key={status}
                          variant={order.order_status === status ? "secondary" : "ghost"}
                          disabled={savingId === order.id}
                          onClick={() => void updateStatus(order.id, status)}
                        >
                          {status}
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!orders.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    Orders will appear here after checkout requests are started.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
