"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Search,
  Truck,
  Wallet
} from "lucide-react";

import {
  OrderStatusBadge,
  PaymentStatusBadge
} from "@/components/admin/order-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildAdminOrderWhatsAppUrl,
  getAllowedOrderStatuses,
  getOrderStatusLabel,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  ORDER_STATUSES,
  PAYMENT_STATUSES
} from "@/lib/admin-orders";
import type { Order, OrderItem, OrderStatus, PaymentStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

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
  const searchParams = useSearchParams();
  const requestedOrderId = searchParams.get("order");
  const [orders, setOrders] = useState(initialOrders);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialOrders.some(order => order.id === requestedOrderId)
      ? requestedOrderId
      : initialOrders[0]?.id ?? null
  );
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    status: "ALL",
    paymentStatus: "ALL",
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
            "error" in payload
              ? payload.error ?? "Unable to load order details."
              : "Unable to load order details."
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

  useEffect(() => {
    if (requestedOrderId && orders.some(order => order.id === requestedOrderId)) {
      setSelectedOrderId(requestedOrderId);
    }
  }, [orders, requestedOrderId]);

  const activeWhatsAppUrl = useMemo(
    () =>
      selectedOrder && selectedItems.length
        ? buildAdminOrderWhatsAppUrl(selectedOrder, selectedItems)
        : null,
    [selectedOrder, selectedItems]
  );

  async function refreshOrders(nextFilters = filters) {
    setLoadingOrders(true);
    setError(null);
    setSuccess(null);

    try {
      const params = new URLSearchParams();

      if (nextFilters.status && nextFilters.status !== "ALL") {
        params.set("status", nextFilters.status);
      }
      if (nextFilters.paymentStatus && nextFilters.paymentStatus !== "ALL") {
        params.set("paymentStatus", nextFilters.paymentStatus);
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

  async function patchOrder(
    id: string,
    updates: { status?: OrderStatus; paymentStatus?: PaymentStatus }
  ) {
    if (
      updates.status === "CANCELLED" &&
      selectedOrder?.order_status !== "CANCELLED" &&
      !window.confirm(
        "Cancel this order? Reserved inventory will be restored to stock."
      )
    ) {
      return;
    }

    setSavingId(id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
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

      const parts: string[] = [];
      if (updates.status) {
        parts.push(
          updates.status === "CANCELLED"
            ? "cancelled (stock restored)"
            : getOrderStatusLabel(updates.status)
        );
      }
      if (updates.paymentStatus) {
        parts.push(`payment ${getPaymentStatusLabel(updates.paymentStatus).toLowerCase()}`);
      }

      setSuccess(`Order #${id.slice(0, 8).toUpperCase()} updated: ${parts.join(", ")}.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to update order."
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
    <div className="grid min-w-0 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
      <section className="min-w-0 border border-border bg-paper p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-brass">Orders</p>
            <h2 className="font-serif text-3xl text-text">Fulfillment queue</h2>
            <p className="mt-2 text-sm text-muted">
              Search by customer name, phone number, or full order ID, then advance fulfillment and record payments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => void refreshOrders()}
              disabled={loadingOrders}
            >
              {loadingOrders ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2 text-sm text-muted">
            <span>Status</span>
            <select
              className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 text-sm text-text outline-none transition focus:border-brass"
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
            <span>Payment</span>
            <select
              className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 text-sm text-text outline-none transition focus:border-brass"
              value={filters.paymentStatus}
              onChange={event =>
                setFilters(current => ({
                  ...current,
                  paymentStatus: event.target.value
                }))
              }
            >
              <option value="ALL">All payments</option>
              {PAYMENT_STATUSES.map(status => (
                <option key={status} value={status}>
                  {status === "PAID" ? "Paid" : "Pending payment"}
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
            <span>Customer / phone / order ID</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                className="pl-10"
                placeholder="Name, phone, or full ID"
                value={filters.search}
                onChange={event =>
                  setFilters(current => ({ ...current, search: event.target.value }))
                }
              />
            </div>
          </label>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <Button onClick={() => void refreshOrders()} disabled={loadingOrders}>
            {loadingOrders ? "Applying..." : "Apply filters"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const cleared = {
                status: "ALL",
                paymentStatus: "ALL",
                search: "",
                from: "",
                to: ""
              };
              setFilters(cleared);
              void refreshOrders(cleared);
            }}
          >
            Clear
          </Button>
        </div>

        {error ? (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p
            className="mb-4 text-sm text-emerald-700 dark:text-emerald-300"
            aria-live="polite"
          >
            {success}
          </p>
        ) : null}

        <div className="space-y-3 md:hidden">
          {orders.map(order => (
            <button
              key={order.id}
              type="button"
              className={`w-full rounded-[2px] border p-4 text-left transition hover:border-brass focus:outline-none focus:ring-2 focus:ring-brass ${
                selectedOrderId === order.id
                  ? "border-brass bg-stone"
                  : "border-border bg-paper"
              }`}
              onClick={() => setSelectedOrderId(order.id)}
              aria-pressed={selectedOrderId === order.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-text">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="mt-1 text-sm text-muted">{order.customer_name}</p>
                  <p className="text-sm text-muted">{order.customer_phone}</p>
                </div>
                <OrderStatusBadge status={order.order_status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                <span className="font-medium text-text">{formatCurrency(order.total)}</span>
                <PaymentStatusBadge status={order.payment_status} />
                <span className="text-muted">{formatDateTime(order.created_at)}</span>
              </div>
            </button>
          ))}
          {!orders.length ? (
            <p className="rounded-[2px] border border-border px-4 py-12 text-center text-sm text-muted">
              {loadingOrders ? "Loading orders..." : "No orders matched the current filters."}
            </p>
          ) : null}
        </div>

        <div className="hidden overflow-hidden border border-border md:block">
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full divide-y divide-border text-sm">
              <thead className="bg-stone text-left text-xs uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="hidden px-4 py-3 xl:table-cell">Location</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-paper">
                {orders.map(order => (
                  <tr
                    key={order.id}
                    className={`transition hover:bg-stone/60 ${
                      selectedOrderId === order.id ? "bg-stone" : ""
                    }`}
                  >
                    <td className="px-4 py-4 font-medium text-text">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className="rounded text-left font-medium text-text underline-offset-4 transition hover:text-brass hover:underline focus:outline-none focus:ring-2 focus:ring-brass"
                        aria-pressed={selectedOrderId === order.id}
                      >
                        {order.id.slice(0, 8).toUpperCase()}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-text">{order.customer_name}</td>
                    <td className="px-4 py-4 text-muted">{order.customer_phone}</td>
                    <td className="hidden px-4 py-4 text-muted xl:table-cell">
                      {order.customer_location}
                    </td>
                    <td className="px-4 py-4 text-text">{formatCurrency(order.total)}</td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-muted">
                          {getPaymentMethodLabel(order.payment_method)}
                        </p>
                        <PaymentStatusBadge status={order.payment_status} />
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <OrderStatusBadge status={order.order_status} />
                    </td>
                    <td className="hidden px-4 py-4 text-muted lg:table-cell">
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

      <aside className="min-w-0 border border-border bg-paper p-4 sm:p-6">
        {!selectedOrder || loadingDetail ? (
          <div className="flex min-h-[320px] items-center justify-center text-sm text-muted">
            {loadingDetail ? "Loading order details..." : "Select an order to view details."}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-brass">Order details</p>
                <h3 className="mt-2 font-serif text-2xl text-text">
                  #{selectedOrder.id.slice(0, 8).toUpperCase()}
                </h3>
                <p className="mt-1 break-words text-sm text-muted">
                  {formatDateTime(selectedOrder.created_at)}
                </p>
              </div>
              <OrderStatusBadge status={selectedOrder.order_status} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[2px] border border-border bg-stone/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
                  Customer
                </p>
                <p className="mt-3 break-words font-medium text-text">
                  {selectedOrder.customer_name}
                </p>
                <p className="mt-1 break-words text-sm text-muted">
                  {selectedOrder.customer_phone}
                </p>
                {selectedOrder.customer_email ? (
                  <p className="mt-1 break-words text-sm text-muted">
                    {selectedOrder.customer_email}
                  </p>
                ) : null}
                <p className="mt-1 break-words text-sm text-muted">
                  {selectedOrder.customer_location}
                </p>
              </div>

              <div className="rounded-[2px] border border-border bg-stone/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
                  Payment
                </p>
                <p className="mt-3 text-sm text-text">
                  Method: {getPaymentMethodLabel(selectedOrder.payment_method)}
                </p>
                <div className="mt-2">
                  <PaymentStatusBadge status={selectedOrder.payment_status} />
                </div>
                <button
                  type="button"
                  disabled={savingId === selectedOrder.id}
                  onClick={() =>
                    void patchOrder(selectedOrder.id, {
                      paymentStatus:
                        selectedOrder.payment_status === "PAID" ? "PENDING" : "PAID"
                    })
                  }
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brass underline underline-offset-4 hover:opacity-80 disabled:opacity-50"
                >
                  <Wallet className="h-3.5 w-3.5" aria-hidden />
                  {selectedOrder.payment_status === "PAID"
                    ? "Mark payment pending"
                    : "Mark as paid"}
                </button>
              </div>
            </div>

            <div className="rounded-[2px] border border-border bg-stone/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
                  Items
                </p>
                <Link
                  href={`/admin/invoices/${selectedOrder.id}`}
                  className="inline-flex items-center gap-1 text-sm text-brass hover:opacity-80"
                >
                  Invoice
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
              <div className="space-y-2.5">
                {selectedItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 rounded-[2px] border border-border bg-paper px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium text-text">
                        {item.product_title}
                      </p>
                      <p className="text-xs text-muted">
                        {item.quantity} x {formatCurrency(item.unit_price)}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium text-text">
                      {formatCurrency(Number(item.unit_price) * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2px] border border-border bg-stone/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
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
                <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-text">
                  <span>Total</span>
                  <span>{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>
            </div>

            {selectedOrder.notes ? (
              <div className="rounded-[2px] border border-border bg-stone/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
                  Notes
                </p>
                <p className="mt-3 text-sm text-text">{selectedOrder.notes}</p>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm text-muted">
                  <span>Fulfillment status</span>
                  <select
                    className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 text-sm text-text outline-none transition focus:border-brass"
                    value={selectedOrder.order_status}
                    disabled={savingId === selectedOrder.id}
                    onChange={event =>
                      void patchOrder(selectedOrder.id, {
                        status: event.target.value as OrderStatus
                      })
                    }
                  >
                    {selectedOrderStatusOptions.map(status => (
                      <option key={status} value={status}>
                        {getOrderStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-sm text-muted">
                  <span>Payment status</span>
                  <select
                    className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 text-sm text-text outline-none transition focus:border-brass"
                    value={selectedOrder.payment_status}
                    disabled={savingId === selectedOrder.id}
                    onChange={event =>
                      void patchOrder(selectedOrder.id, {
                        paymentStatus: event.target.value as PaymentStatus
                      })
                    }
                  >
                    {PAYMENT_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {getPaymentStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {savingId === selectedOrder.id ? (
                <p className="text-sm text-muted" aria-live="polite">
                  Saving order update...
                </p>
              ) : null}

              <div className="grid gap-2.5 sm:grid-cols-2">
                {selectedOrderStatusOptions.includes("CONFIRMED") &&
                selectedOrder.order_status !== "CONFIRMED" ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => void patchOrder(selectedOrder.id, { status: "CONFIRMED" })}
                    disabled={savingId === selectedOrder.id}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirm order
                  </Button>
                ) : null}

                {selectedOrderStatusOptions.includes("OUT_FOR_DELIVERY") &&
                selectedOrder.order_status !== "OUT_FOR_DELIVERY" ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() =>
                      void patchOrder(selectedOrder.id, { status: "OUT_FOR_DELIVERY" })
                    }
                    disabled={savingId === selectedOrder.id}
                  >
                    <Truck className="mr-2 h-4 w-4" />
                    Out for delivery
                  </Button>
                ) : null}

                {selectedOrderStatusOptions.includes("DELIVERED") &&
                selectedOrder.order_status !== "DELIVERED" ? (
                  <Button
                    className="w-full"
                    onClick={() =>
                      void patchOrder(selectedOrder.id, {
                        status: "DELIVERED",
                        paymentStatus: "PAID"
                      })
                    }
                    disabled={savingId === selectedOrder.id}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Delivered & paid
                  </Button>
                ) : null}

                {activeWhatsAppUrl ? (
                  <a
                    href={activeWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline w-full"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp customer
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
