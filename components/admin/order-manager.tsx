"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search, Truck, MessageCircle } from "lucide-react";

import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildAdminOrderWhatsAppUrl,
  getAllowedOrderStatuses,
  getOrderStatusLabel,
  getPaymentMethodLabel,
  ORDER_STATUSES
} from "@/lib/admin-orders";
import { formatCurrency } from "@/lib/utils";
import type { Order, OrderItem, OrderStatus } from "@/lib/types";

interface OrderManagerProps {
  initialOrders: Order[];
}

interface OrderDetailResponse {
  order: Order;
  items: OrderItem[];
}

function hasOrderDetailResponse(
  payload: OrderDetailResponse | { error?: string }
): payload is OrderDetailResponse {
  return "order" in payload && "items" in payload;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function OrderManager({ initialOrders }: OrderManagerProps) {
  const [orders, setOrders] = useState(initialOrders);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialOrders[0]?.id ?? null
  );
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: "ALL",
    search: "",
    from: "",
    to: ""
  });

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      setSelectedItems([]);
      return;
    }

    let cancelled = false;

    async function loadOrderDetail() {
      setLoadingDetail(true);
      setError(null);

      try {
        const response = await fetch(`/api/admin/orders/${selectedOrderId}`);
        const payload = (await response.json()) as
          | OrderDetailResponse
          | { error?: string };

        if (!response.ok || !hasOrderDetailResponse(payload)) {
          throw new Error(
            "error" in payload ? payload.error ?? "Unable to load order details." : "Unable to load order details."
          );
        }

        if (!cancelled) {
          setSelectedOrder(payload.order);
          setSelectedItems(payload.items);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load order details."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      }
    }

    void loadOrderDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedOrderId]);

  const activeWhatsAppUrl =
    selectedOrder && selectedItems.length
      ? buildAdminOrderWhatsAppUrl(selectedOrder, selectedItems)
      : null;

  async function refreshOrders(nextFilters = filters) {
    setLoadingOrders(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (nextFilters.status && nextFilters.status !== "ALL") {
        params.set("status", nextFilters.status);
      }

      if (nextFilters.search.trim()) {
        params.set("search", nextFilters.search.trim());
      }

      if (nextFilters.from) {
        params.set("from", nextFilters.from);
      }

      if (nextFilters.to) {
        params.set("to", nextFilters.to);
      }

      const response = await fetch(`/api/admin/orders?${params.toString()}`);
      const payload = (await response.json()) as { orders?: Order[]; error?: string };

      if (!response.ok || !payload.orders) {
        throw new Error(payload.error ?? "Unable to load orders.");
      }

      setOrders(payload.orders);

      if (!payload.orders.some(order => order.id === selectedOrderId)) {
        setSelectedOrderId(payload.orders[0]?.id ?? null);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to load orders."
      );
    } finally {
      setLoadingOrders(false);
    }
  }

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

      setOrders(current =>
        current.map(order => (order.id === id ? payload.order! : order))
      );

      if (selectedOrder?.id === id) {
        setSelectedOrder(payload.order);
      }
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

  const selectedOrderStatusOptions = useMemo(
    () =>
      selectedOrder ? getAllowedOrderStatuses(selectedOrder.order_status) : ORDER_STATUSES,
    [selectedOrder]
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
      <section className="rounded-2xl border border-white/50 bg-white/70 p-6 shadow-luxe backdrop-blur">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">
              Orders
            </p>
            <h2 className="font-serif text-3xl text-ink">Fulfillment queue</h2>
            <p className="mt-2 text-sm text-muted">
              Search by full order ID or phone number, then advance the order through fulfillment.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => void refreshOrders()}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 text-sm text-muted">
            <span>Status</span>
            <select
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-bronze"
              value={filters.status}
              onChange={event =>
                setFilters(current => ({ ...current, status: event.target.value }))
              }
            >
              <option value="ALL">All statuses</option>
              {ORDER_STATUSES.map(status => (
                <option key={status} value={status}>
                  {getOrderStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm text-muted">
            <span>From</span>
            <Input
              type="date"
              value={filters.from}
              onChange={event =>
                setFilters(current => ({ ...current, from: event.target.value }))
              }
            />
          </label>

          <label className="space-y-2 text-sm text-muted">
            <span>To</span>
            <Input
              type="date"
              value={filters.to}
              onChange={event =>
                setFilters(current => ({ ...current, to: event.target.value }))
              }
            />
          </label>

          <label className="space-y-2 text-sm text-muted">
            <span>Order ID / phone</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                className="pl-10"
                placeholder="Search..."
                value={filters.search}
                onChange={event =>
                  setFilters(current => ({ ...current, search: event.target.value }))
                }
              />
            </div>
          </label>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <Button onClick={() => void refreshOrders()}>Apply filters</Button>
          <Button
            variant="ghost"
            onClick={() => {
              const cleared = { status: "ALL", search: "", from: "", to: "" };
              setFilters(cleared);
              void refreshOrders(cleared);
            }}
          >
            Clear
          </Button>
        </div>

        {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}

        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-sand/50 text-left uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white/80">
                {orders.map(order => (
                  <tr
                    key={order.id}
                    className={`cursor-pointer transition hover:bg-sand/40 ${
                      selectedOrderId === order.id ? "bg-sand/50" : ""
                    }`}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <td className="px-4 py-4 font-medium text-ink">
                      {order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-4 text-ink">{order.customer_name}</td>
                    <td className="px-4 py-4 text-muted">{order.customer_phone}</td>
                    <td className="px-4 py-4 text-muted">{order.customer_location}</td>
                    <td className="px-4 py-4 text-ink">{formatCurrency(order.total)}</td>
                    <td className="px-4 py-4 text-muted">
                      {getPaymentMethodLabel(order.payment_method)}
                    </td>
                    <td className="px-4 py-4">
                      <OrderStatusBadge status={order.order_status} />
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {formatDateTime(order.created_at)}
                    </td>
                  </tr>
                ))}
                {!orders.length ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted">
                      {loadingOrders
                        ? "Loading orders..."
                        : "No orders matched the current filters."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <aside className="rounded-2xl border border-white/50 bg-white/70 p-6 shadow-luxe backdrop-blur">
        {!selectedOrder || loadingDetail ? (
          <div className="flex min-h-[320px] items-center justify-center text-sm text-muted">
            {loadingDetail ? "Loading order details..." : "Select an order to view details."}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-bronze">
                  Order details
                </p>
                <h3 className="mt-2 font-serif text-2xl text-ink">
                  #{selectedOrder.id.slice(0, 8).toUpperCase()}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {formatDateTime(selectedOrder.created_at)}
                </p>
              </div>
              <OrderStatusBadge status={selectedOrder.order_status} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
                  Customer
                </p>
                <p className="mt-3 font-medium text-ink">{selectedOrder.customer_name}</p>
                <p className="mt-1 text-sm text-muted">{selectedOrder.customer_phone}</p>
                {selectedOrder.customer_email ? (
                  <p className="mt-1 text-sm text-muted">{selectedOrder.customer_email}</p>
                ) : null}
                <p className="mt-1 text-sm text-muted">{selectedOrder.customer_location}</p>
              </div>
              <div className="rounded-xl border border-border bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
                  Payment
                </p>
                <p className="mt-3 text-sm text-ink">
                  Method: {getPaymentMethodLabel(selectedOrder.payment_method)}
                </p>
                <div className="mt-2">
                  <Badge className="border-yellow-200 bg-yellow-100 text-yellow-900">
                    {selectedOrder.payment_status.toLowerCase()}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-white/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
                  Items
                </p>
                <Link
                  href={`/admin/invoices/${selectedOrder.id}`}
                  className="inline-flex items-center gap-1 text-sm text-bronze hover:text-ink"
                >
                  Invoice
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
              <div className="space-y-3">
                {selectedItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-border/80 px-3 py-3"
                  >
                    <div>
                      <p className="font-medium text-ink">{item.product_title}</p>
                      <p className="text-xs text-muted">
                        {item.quantity} x {formatCurrency(item.unit_price)}
                      </p>
                    </div>
                    <p className="font-medium text-ink">
                      {formatCurrency(Number(item.unit_price) * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-white/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
                Totals
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between text-muted">
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-muted">
                  <span>Shipping</span>
                  <span>{formatCurrency(selectedOrder.shipping_fee)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-ink">
                  <span>Total</span>
                  <span>{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>
            </div>

            {selectedOrder.notes ? (
              <div className="rounded-xl border border-border bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
                  Notes
                </p>
                <p className="mt-3 text-sm text-muted">{selectedOrder.notes}</p>
              </div>
            ) : null}

            <div className="space-y-3">
              <label className="space-y-2 text-sm text-muted">
                <span>Update status</span>
                <select
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-bronze"
                  value={selectedOrder.order_status}
                  disabled={savingId === selectedOrder.id}
                  onChange={event =>
                    void updateStatus(
                      selectedOrder.id,
                      event.target.value as OrderStatus
                    )
                  }
                >
                  {selectedOrderStatusOptions.map(status => (
                    <option key={status} value={status}>
                      {getOrderStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => void updateStatus(selectedOrder.id, "OUT_FOR_DELIVERY")}
                  disabled={
                    savingId === selectedOrder.id ||
                    !selectedOrderStatusOptions.includes("OUT_FOR_DELIVERY")
                  }
                >
                  <Truck className="mr-2 h-4 w-4" />
                  Mark out for delivery
                </Button>
                {activeWhatsAppUrl ? (
                  <a
                    href={activeWhatsAppUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-ink transition hover:bg-white/70"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Send WhatsApp Confirmation
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
