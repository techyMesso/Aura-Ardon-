"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  MessageCircle,
  RotateCcw,
  Search,
  Truck,
  Wallet,
  X
} from "lucide-react";

import {
  OrderStatusBadge,
  PaymentStatusBadge
} from "@/components/admin/order-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  buildAdminOrderWhatsAppUrl,
  canCancelOrderStatus,
  canReturnOrderStatus,
  CANONICAL_ORDER_STATUSES,
  formatOrderDisplayNumber,
  getCancelReasonLabel,
  getCanonicalStatusLabel,
  getNextValidCanonicalStatuses,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  isPendingOrderOverdue24h,
  ORDER_CANCEL_REASONS,
  PAYMENT_STATUSES,
  resolveCanonicalOrderStatus
} from "@/lib/admin-orders";
import type {
  CanonicalOrderStatus,
  Order,
  OrderCancelReason,
  OrderItem,
  OrderReturnCondition,
  OrderReturnRecord,
  OrderStatusHistoryEntry,
  PaymentStatus
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface OrderManagerProps {
  initialOrders: Order[];
}

interface OrderDetailResponse {
  order: Order;
  items: OrderItem[];
  history?: OrderStatusHistoryEntry[];
  returns?: OrderReturnRecord[];
}

const STATUS_TABS: Array<{ value: "all" | CanonicalOrderStatus; label: string }> = [
  { value: "all", label: "All" },
  ...CANONICAL_ORDER_STATUSES.map(status => ({
    value: status,
    label: getCanonicalStatusLabel(status)
  }))
];

function hasOrderDetailResponse(
  payload: OrderDetailResponse | { error?: string }
): payload is OrderDetailResponse {
  return "order" in payload && "items" in payload;
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
  const [selectedHistory, setSelectedHistory] = useState<OrderStatusHistoryEntry[]>([]);
  const [selectedReturns, setSelectedReturns] = useState<OrderReturnRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    status: "all" | CanonicalOrderStatus;
    paymentStatus: "ALL" | PaymentStatus;
    search: string;
    from: string;
    to: string;
  }>({
    status: "all",
    paymentStatus: "ALL",
    search: "",
    from: "",
    to: ""
  });

  // Cancel modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<OrderCancelReason>("customer_cancelled");
  const [cancelNote, setCancelNote] = useState("");

  // Return modal state
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnCondition, setReturnCondition] =
    useState<OrderReturnCondition>("resellable");
  const [returnNote, setReturnNote] = useState("");
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      setSelectedItems([]);
      setSelectedHistory([]);
      setSelectedReturns([]);
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
          setSelectedHistory(payload.history ?? []);
          setSelectedReturns(payload.returns ?? []);
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

  // Compute remaining returnable quantity per order_item_id
  const returnableByItemId = useMemo(() => {
    const alreadyReturned = new Map<string, number>();
    for (const ret of selectedReturns) {
      if (!ret.order_item_id) continue;
      alreadyReturned.set(
        ret.order_item_id,
        (alreadyReturned.get(ret.order_item_id) ?? 0) + ret.quantity
      );
    }

    const result = new Map<string, { ordered: number; returned: number; remaining: number }>();
    for (const item of selectedItems) {
      const returned = alreadyReturned.get(item.id) ?? 0;
      result.set(item.id, {
        ordered: item.quantity,
        returned,
        remaining: Math.max(0, item.quantity - returned)
      });
    }
    return result;
  }, [selectedItems, selectedReturns]);

  const totalReturnableRemaining = useMemo(
    () =>
      Array.from(returnableByItemId.values()).reduce(
        (sum, entry) => sum + entry.remaining,
        0
      ),
    [returnableByItemId]
  );

  const selectedReturnsTotalAmount = useMemo(
    () =>
      selectedReturns.reduce((sum, ret) => sum + Number(ret.refund_amount ?? 0), 0),
    [selectedReturns]
  );

  function syncUpdatedBundle(bundle: OrderDetailResponse) {
    setSelectedOrder(bundle.order);
    setSelectedItems(bundle.items);
    if (bundle.history) setSelectedHistory(bundle.history);
    if (bundle.returns) setSelectedReturns(bundle.returns);
    setOrders(current =>
      current.map(order => (order.id === bundle.order.id ? bundle.order : order))
    );
  }

  async function refreshOrders(nextFilters = filters) {
    setLoadingOrders(true);
    setError(null);
    setSuccess(null);

    try {
      const params = new URLSearchParams();

      if (nextFilters.status && nextFilters.status !== "all") {
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

  async function transitionOrderStatus(
    order: Order,
    nextStatus: "confirmed" | "dispatched" | "delivered"
  ) {
    setSavingId(order.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = (await response.json()) as OrderDetailResponse & {
        error?: string;
      };

      if (!response.ok || !payload.order) {
        throw new Error(payload.error ?? "Unable to update order status.");
      }

      syncUpdatedBundle(payload);
      setSuccess(
        `Order ${formatOrderDisplayNumber(payload.order)} marked ${getCanonicalStatusLabel(
          nextStatus
        ).toLowerCase()}.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update order status."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function togglePaymentStatus(order: Order, paymentStatus: PaymentStatus) {
    setSavingId(order.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus })
      });
      const payload = (await response.json()) as { order?: Order; error?: string };

      if (!response.ok || !payload.order) {
        throw new Error(payload.error ?? "Unable to update payment status.");
      }

      setOrders(current =>
        current.map(candidate =>
          candidate.id === order.id ? { ...candidate, ...payload.order! } : candidate
        )
      );
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(current => (current ? { ...current, ...payload.order! } : current));
      }

      setSuccess(
        `Order ${formatOrderDisplayNumber(order)} payment marked ${getPaymentStatusLabel(
          paymentStatus
        ).toLowerCase()}.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update payment status."
      );
    } finally {
      setSavingId(null);
    }
  }

  function openCancelModal() {
    setCancelReason("customer_cancelled");
    setCancelNote("");
    setCancelModalOpen(true);
  }

  async function handleConfirmCancel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;

    setSavingId(selectedOrder.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/orders/${selectedOrder.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason,
          note: cancelNote.trim() || null
        })
      });
      const payload = (await response.json()) as OrderDetailResponse & {
        restockedItemsCount?: number;
        alreadyRestocked?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.order) {
        throw new Error(payload.error ?? "Unable to cancel order.");
      }

      syncUpdatedBundle(payload);
      setCancelModalOpen(false);
      const count = payload.restockedItemsCount ?? 0;
      setSuccess(
        payload.alreadyRestocked
          ? `Order ${formatOrderDisplayNumber(payload.order)} was already cancelled and restocked.`
          : `Order ${formatOrderDisplayNumber(payload.order)} cancelled — ${count} ${
              count === 1 ? "item" : "items"
            } returned to stock.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to cancel order."
      );
    } finally {
      setSavingId(null);
    }
  }

  function openReturnModal() {
    const initialQty: Record<string, number> = {};
    for (const item of selectedItems) {
      const remaining = returnableByItemId.get(item.id)?.remaining ?? 0;
      initialQty[item.id] = remaining > 0 ? remaining : 0;
    }
    setReturnQuantities(initialQty);
    setReturnCondition("resellable");
    setReturnNote("");
    setReturnModalOpen(true);
  }

  async function handleConfirmReturn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;

    const chosenItems = Object.entries(returnQuantities)
      .filter(([, qty]) => Number.isInteger(qty) && qty > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));

    if (chosenItems.length === 0) {
      setError("Select at least one item and quantity to return.");
      return;
    }

    setSavingId(selectedOrder.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/orders/${selectedOrder.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: chosenItems,
          condition: returnCondition,
          note: returnNote.trim() || null
        })
      });
      const payload = (await response.json()) as OrderDetailResponse & {
        returnedUnits?: number;
        restockedUnits?: number;
        error?: string;
      };

      if (!response.ok || !payload.order) {
        throw new Error(payload.error ?? "Unable to record order return.");
      }

      syncUpdatedBundle(payload);
      setReturnModalOpen(false);
      const returnedUnits = payload.returnedUnits ?? 0;
      const restockedUnits = payload.restockedUnits ?? 0;
      setSuccess(
        returnCondition === "resellable"
          ? `Recorded return for ${formatOrderDisplayNumber(payload.order)}: ${returnedUnits} ${
              returnedUnits === 1 ? "item" : "items"
            } returned (${restockedUnits} restocked).`
          : `Recorded damaged return for ${formatOrderDisplayNumber(payload.order)}: ${returnedUnits} ${
              returnedUnits === 1 ? "item" : "items"
            } logged as damaged write-off (not restocked).`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to record order return."
      );
    } finally {
      setSavingId(null);
    }
  }

  const selectedCanonicalStatus = selectedOrder
    ? resolveCanonicalOrderStatus(selectedOrder)
    : null;
  const nextValidStatuses = selectedCanonicalStatus
    ? getNextValidCanonicalStatuses(selectedCanonicalStatus)
    : [];
  const selectedOverdue24h = selectedOrder
    ? isPendingOrderOverdue24h(selectedOrder)
    : false;

  return (
    <div className="grid min-w-0 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(380px,1.05fr)]">
      <section className="min-w-0 border border-border bg-paper p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-brass">Orders</p>
            <h2 className="font-serif text-3xl text-text">Fulfillment queue</h2>
            <p className="mt-2 text-sm text-muted">
              Orders are permanent and never deleted. Pending orders older than 24 hours are highlighted ahead of automatic 48h cancellation.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => void refreshOrders()}
            disabled={loadingOrders}
          >
            {loadingOrders ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {/* Status Tabs */}
        <div
          role="tablist"
          aria-label="Filter orders by status"
          className="mb-5 flex gap-1.5 overflow-x-auto border-b border-border pb-3"
        >
          {STATUS_TABS.map(tab => {
            const active = filters.status === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  const next = { ...filters, status: tab.value };
                  setFilters(next);
                  void refreshOrders(next);
                }}
                className={`min-h-10 shrink-0 rounded-[2px] border px-3.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-brass ${
                  active
                    ? "border-brass bg-brass text-ink"
                    : "border-border bg-paper text-muted hover:border-brass/60 hover:text-text"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Date Filters */}
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-sm text-muted">
            <span>Order no. / name / phone</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                className="pl-10"
                placeholder="AA-7F3K2, Amina, 2547..."
                value={filters.search}
                onChange={event =>
                  setFilters(current => ({ ...current, search: event.target.value }))
                }
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void refreshOrders();
                  }
                }}
              />
            </div>
          </label>

          <label className="space-y-1.5 text-sm text-muted">
            <span>Payment</span>
            <select
              className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 text-sm text-text outline-none transition focus:border-brass"
              value={filters.paymentStatus}
              onChange={event =>
                setFilters(current => ({
                  ...current,
                  paymentStatus: event.target.value as "ALL" | PaymentStatus
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

          <label className="space-y-1.5 text-sm text-muted">
            <span>From</span>
            <Input
              type="date"
              value={filters.from}
              onChange={event =>
                setFilters(current => ({ ...current, from: event.target.value }))
              }
            />
          </label>

          <label className="space-y-1.5 text-sm text-muted">
            <span>To</span>
            <Input
              type="date"
              value={filters.to}
              onChange={event =>
                setFilters(current => ({ ...current, to: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <Button onClick={() => void refreshOrders()} disabled={loadingOrders}>
            {loadingOrders ? "Applying..." : "Apply filters"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const cleared = {
                status: "all" as const,
                paymentStatus: "ALL" as const,
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
          <p
            className="mb-4 rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {success ? (
          <p
            className="mb-4 rounded-[2px] border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
            aria-live="polite"
          >
            {success}
          </p>
        ) : null}

        {/* Mobile Order Cards */}
        <div className="space-y-3 md:hidden">
          {orders.map(order => {
            const canonical = resolveCanonicalOrderStatus(order);
            const overdue = isPendingOrderOverdue24h(order);
            return (
              <button
                key={order.id}
                type="button"
                className={`w-full rounded-[2px] border p-4 text-left transition hover:border-brass focus:outline-none focus:ring-2 focus:ring-brass ${
                  selectedOrderId === order.id
                    ? "border-brass bg-stone"
                    : overdue
                      ? "border-l-4 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20"
                      : "border-border bg-paper"
                }`}
                onClick={() => setSelectedOrderId(order.id)}
                aria-pressed={selectedOrderId === order.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-text">
                        {formatOrderDisplayNumber(order)}
                      </p>
                      {overdue ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                          <Clock className="h-3 w-3" aria-hidden />
                          Pending &gt;24h
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">{order.customer_name}</p>
                    <p className="text-sm text-muted">{order.customer_phone}</p>
                  </div>
                  <OrderStatusBadge status={canonical} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                  <span className="font-medium text-text">{formatCurrency(order.total)}</span>
                  <PaymentStatusBadge status={order.payment_status} />
                  <span className="text-muted">
                    {formatNairobiDateTime(order.created_at)}
                  </span>
                </div>
              </button>
            );
          })}
          {!orders.length ? (
            <p className="rounded-[2px] border border-border px-4 py-12 text-center text-sm text-muted">
              {loadingOrders ? "Loading orders..." : "No orders matched the current filters."}
            </p>
          ) : null}
        </div>

        {/* Desktop Orders Table */}
        <div className="hidden overflow-hidden border border-border md:block">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full divide-y divide-border text-sm">
              <thead className="bg-stone text-left text-xs uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="hidden px-4 py-3 xl:table-cell">Zone / Location</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Created (EAT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-paper">
                {orders.map(order => {
                  const canonical = resolveCanonicalOrderStatus(order);
                  const overdue = isPendingOrderOverdue24h(order);
                  return (
                    <tr
                      key={order.id}
                      className={`transition hover:bg-stone/60 ${
                        selectedOrderId === order.id
                          ? "bg-stone"
                          : overdue
                            ? "bg-amber-50/50 dark:bg-amber-950/20"
                            : ""
                      }`}
                    >
                      <td className="px-4 py-4 font-medium text-text">
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedOrderId(order.id)}
                            className="rounded text-left font-semibold text-text underline-offset-4 transition hover:text-brass hover:underline focus:outline-none focus:ring-2 focus:ring-brass"
                            aria-pressed={selectedOrderId === order.id}
                          >
                            {formatOrderDisplayNumber(order)}
                          </button>
                          {overdue ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
                              <Clock className="h-3 w-3" aria-hidden />
                              Pending &gt;24h
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-text">{order.customer_name}</td>
                      <td className="px-4 py-4 text-muted">{order.customer_phone}</td>
                      <td className="hidden px-4 py-4 text-muted xl:table-cell">
                        {order.delivery_zone_name || order.customer_location}
                      </td>
                      <td className="px-4 py-4 font-medium text-text">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-4 py-4">
                        <PaymentStatusBadge status={order.payment_status} />
                      </td>
                      <td className="px-4 py-4">
                        <OrderStatusBadge status={canonical} />
                      </td>
                      <td className="hidden px-4 py-4 text-muted lg:table-cell">
                        {formatNairobiDateTime(order.created_at)}
                      </td>
                    </tr>
                  );
                })}
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

      {/* Order Detail Panel */}
      <aside className="min-w-0 border border-border bg-paper p-4 sm:p-6">
        {!selectedOrder || loadingDetail || !selectedCanonicalStatus ? (
          <div className="flex min-h-[320px] items-center justify-center text-sm text-muted">
            {loadingDetail ? "Loading order details..." : "Select an order to view details."}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-brass">Order details</p>
                <h3 className="mt-1 font-serif text-2xl text-text">
                  {formatOrderDisplayNumber(selectedOrder)}
                </h3>
                <p className="mt-1 break-words text-sm text-muted">
                  {formatNairobiDateTime(selectedOrder.created_at)} EAT
                </p>
              </div>
              <OrderStatusBadge status={selectedCanonicalStatus} />
            </div>

            {selectedOverdue24h ? (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-[2px] border border-amber-400/60 bg-amber-100/60 p-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  Pending for over 24 hours. Follow up on WhatsApp — unconfirmed orders are auto-cancelled and restocked after the configured timeout.
                </p>
              </div>
            ) : null}

            {/* Valid Next Status Action Buttons ONLY */}
            <div className="space-y-3 rounded-[2px] border border-brass/30 bg-stone/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
                Order actions
              </p>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {nextValidStatuses.includes("confirmed") ? (
                  <Button
                    className="w-full"
                    disabled={savingId === selectedOrder.id}
                    onClick={() => void transitionOrderStatus(selectedOrder, "confirmed")}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                    Confirm order
                  </Button>
                ) : null}

                {nextValidStatuses.includes("dispatched") ? (
                  <Button
                    className="w-full"
                    disabled={savingId === selectedOrder.id}
                    onClick={() => void transitionOrderStatus(selectedOrder, "dispatched")}
                  >
                    <Truck className="mr-2 h-4 w-4" aria-hidden />
                    Mark dispatched
                  </Button>
                ) : null}

                {nextValidStatuses.includes("delivered") ? (
                  <Button
                    className="w-full"
                    disabled={savingId === selectedOrder.id}
                    onClick={() => void transitionOrderStatus(selectedOrder, "delivered")}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                    Mark delivered
                  </Button>
                ) : null}

                {canCancelOrderStatus(selectedCanonicalStatus) ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full"
                    disabled={savingId === selectedOrder.id}
                    onClick={openCancelModal}
                  >
                    <Ban className="mr-2 h-4 w-4" aria-hidden />
                    Cancel order
                  </Button>
                ) : null}

                {canReturnOrderStatus(selectedCanonicalStatus) &&
                totalReturnableRemaining > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={savingId === selectedOrder.id}
                    onClick={openReturnModal}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                    Mark returned
                  </Button>
                ) : null}

                {activeWhatsAppUrl ? (
                  <a
                    href={activeWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline w-full"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    WhatsApp customer
                  </a>
                ) : null}
              </div>

              {selectedCanonicalStatus === "cancelled" ? (
                <div className="rounded-[2px] border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                  <p className="font-semibold">
                    Cancelled: {getCancelReasonLabel(selectedOrder.cancel_reason)}
                  </p>
                  {selectedOrder.cancel_note ? (
                    <p className="mt-1 text-xs">{selectedOrder.cancel_note}</p>
                  ) : null}
                  {selectedOrder.restocked_at ? (
                    <p className="mt-1 text-xs">
                      Restocked: {formatNairobiDateTime(selectedOrder.restocked_at)} EAT
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Customer & Payment */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[2px] border border-border bg-stone/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
                  Customer & delivery
                </p>
                <p className="mt-3 break-words font-medium text-text">
                  {selectedOrder.customer_name}
                </p>
                <p className="mt-1 break-words text-sm text-muted">
                  {selectedOrder.customer_phone}
                </p>
                <p className="mt-1 break-words text-sm text-muted">
                  {selectedOrder.delivery_zone_name
                    ? `${selectedOrder.delivery_zone_name} — ${selectedOrder.delivery_address ?? selectedOrder.customer_location}`
                    : selectedOrder.customer_location}
                </p>
                {selectedOrder.town_county ? (
                  <p className="mt-1 text-sm text-muted">
                    Town/County: {selectedOrder.town_county}
                  </p>
                ) : null}
              </div>

              <div className="rounded-[2px] border border-border bg-stone/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
                  Payment
                </p>
                <p className="mt-3 text-sm text-text">
                  {getPaymentMethodLabel(selectedOrder.payment_method)}
                </p>
                <div className="mt-2">
                  <PaymentStatusBadge status={selectedOrder.payment_status} />
                </div>
                {selectedCanonicalStatus !== "cancelled" ? (
                  <button
                    type="button"
                    disabled={savingId === selectedOrder.id}
                    onClick={() =>
                      void togglePaymentStatus(
                        selectedOrder,
                        selectedOrder.payment_status === "PAID" ? "PENDING" : "PAID"
                      )
                    }
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brass underline underline-offset-4 hover:opacity-80 disabled:opacity-50"
                  >
                    <Wallet className="h-3.5 w-3.5" aria-hidden />
                    {selectedOrder.payment_status === "PAID"
                      ? "Mark payment pending"
                      : "Mark as paid"}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Items */}
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
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </Link>
              </div>
              <div className="space-y-2.5">
                {selectedItems.map(item => {
                  const returnInfo = returnableByItemId.get(item.id);
                  return (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 rounded-[2px] border border-border bg-paper px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium text-text">
                          {item.product_title}
                        </p>
                        <p className="text-xs text-muted">
                          {item.quantity} × {formatCurrency(item.unit_price)}
                          {returnInfo && returnInfo.returned > 0
                            ? ` (${returnInfo.returned} returned)`
                            : ""}
                        </p>
                      </div>
                      <p className="shrink-0 font-medium text-text">
                        {formatCurrency(Number(item.unit_price) * item.quantity)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals */}
            <div className="rounded-[2px] border border-border bg-stone/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
                Totals
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between text-muted">
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                {Number(selectedOrder.discount_amount ?? 0) > 0 ? (
                  <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
                    <span>
                      Discount
                      {selectedOrder.discount_code
                        ? ` (${selectedOrder.discount_code})`
                        : ""}
                    </span>
                    <span>-{formatCurrency(selectedOrder.discount_amount ?? 0)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-muted">
                  <span>
                    Delivery
                    {selectedOrder.delivery_zone_name
                      ? ` (${selectedOrder.delivery_zone_name})`
                      : ""}
                  </span>
                  <span>
                    {Number(selectedOrder.shipping_fee) === 0
                      ? "Free"
                      : formatCurrency(selectedOrder.shipping_fee)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold text-text">
                  <span>Order total</span>
                  <span>{formatCurrency(selectedOrder.total)}</span>
                </div>
                {selectedReturnsTotalAmount > 0 ? (
                  <>
                    <div className="flex items-center justify-between text-purple-700 dark:text-purple-300">
                      <span>Returned value</span>
                      <span>-{formatCurrency(selectedReturnsTotalAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold text-text">
                      <span>Net revenue</span>
                      <span>
                        {formatCurrency(
                          Math.max(0, Number(selectedOrder.total) - selectedReturnsTotalAmount)
                        )}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {/* Notes / Gift */}
            {selectedOrder.is_gift || selectedOrder.notes ? (
              <div className="rounded-[2px] border border-border bg-stone/50 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
                  Notes & gift info
                </p>
                {selectedOrder.is_gift ? (
                  <p className="text-sm font-medium text-text">
                    Gift order{selectedOrder.gift_note ? `: "${selectedOrder.gift_note}"` : ""}
                  </p>
                ) : null}
                {selectedOrder.notes ? (
                  <p className="text-sm text-muted">{selectedOrder.notes}</p>
                ) : null}
              </div>
            ) : null}

            {/* Returned Items Log */}
            {selectedReturns.length > 0 ? (
              <div className="rounded-[2px] border border-purple-400/40 bg-purple-500/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-700 dark:text-purple-300">
                  Recorded returns
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  {selectedReturns.map(ret => (
                    <li
                      key={ret.id}
                      className="rounded-[2px] border border-border bg-paper px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-text">
                          {ret.quantity} × {ret.product_title}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                          {ret.condition === "resellable"
                            ? "Resellable (restocked)"
                            : "Damaged (write-off)"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        -{formatCurrency(ret.refund_amount)} · by {ret.created_by} ·{" "}
                        {formatNairobiDateTime(ret.created_at)}
                      </p>
                      {ret.note ? (
                        <p className="mt-1 text-xs text-text">{ret.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Status Timeline from order_status_history */}
            <div className="rounded-[2px] border border-border bg-stone/50 p-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-brass" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
                  Status timeline
                </p>
              </div>
              {selectedHistory.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No status history recorded yet.</p>
              ) : (
                <ol className="mt-4 space-y-3 border-l-2 border-brass/40 pl-4">
                  {selectedHistory.map(entry => (
                    <li key={entry.id} className="relative text-sm">
                      <span
                        className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brass"
                        aria-hidden
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <OrderStatusBadge status={entry.to_status} />
                        {entry.from_status ? (
                          <span className="text-xs text-muted">
                            from {getCanonicalStatusLabel(entry.from_status).toLowerCase()}
                          </span>
                        ) : null}
                      </div>
                      {entry.reason ? (
                        <p className="mt-1 text-xs text-text">{entry.reason}</p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-muted">
                        {formatNairobiDateTime(entry.created_at)} EAT · by{" "}
                        <span className="font-medium text-text">{entry.changed_by}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Cancel Order Modal */}
      {cancelModalOpen && selectedOrder ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-order-modal-title"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close cancel dialog"
            className="absolute inset-0 bg-ink/60 backdrop-blur-[1px]"
            onClick={() => setCancelModalOpen(false)}
          />
          <form
            onSubmit={handleConfirmCancel}
            className="relative z-10 w-full max-w-md space-y-4 border border-border bg-paper p-5 text-text shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600 dark:text-red-400">
                  Cancel order
                </p>
                <h3
                  id="cancel-order-modal-title"
                  className="mt-1 font-serif text-2xl text-text"
                >
                  Cancel {formatOrderDisplayNumber(selectedOrder)}?
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setCancelModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] text-muted hover:bg-stone hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted">
              All items in this order will be automatically returned to stock and recorded in the stock ledger. This order remains permanently in your records.
            </p>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-text">
                Cancellation reason <span className="text-brass">*</span>
              </span>
              <select
                required
                value={cancelReason}
                onChange={event =>
                  setCancelReason(event.target.value as OrderCancelReason)
                }
                className="h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 text-sm text-text outline-none transition focus:border-brass"
              >
                {ORDER_CANCEL_REASONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-text">Note (optional)</span>
              <Textarea
                rows={3}
                placeholder="Add any context for the timeline..."
                value={cancelNote}
                onChange={event => setCancelNote(event.target.value)}
              />
            </label>

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCancelModalOpen(false)}
                disabled={savingId === selectedOrder.id}
              >
                Keep order
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={savingId === selectedOrder.id}
              >
                {savingId === selectedOrder.id
                  ? "Cancelling..."
                  : "Confirm cancellation & restock"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Mark Returned Modal */}
      {returnModalOpen && selectedOrder ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-order-modal-title"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close return dialog"
            className="absolute inset-0 bg-ink/60 backdrop-blur-[1px]"
            onClick={() => setReturnModalOpen(false)}
          />
          <form
            onSubmit={handleConfirmReturn}
            className="relative z-10 max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto border border-border bg-paper p-5 text-text shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
                  Record return
                </p>
                <h3
                  id="return-order-modal-title"
                  className="mt-1 font-serif text-2xl text-text"
                >
                  Return items on {formatOrderDisplayNumber(selectedOrder)}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setReturnModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] text-muted hover:bg-stone hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <p className="text-sm font-medium text-text">Items & quantities to return</p>
              {selectedItems.map(item => {
                const info = returnableByItemId.get(item.id);
                const maxQty = info?.remaining ?? 0;
                const value = returnQuantities[item.id] ?? 0;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-[2px] border border-border bg-stone/40 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">
                        {item.product_title}
                      </p>
                      <p className="text-xs text-muted">
                        Ordered: {item.quantity} · Returnable: {maxQty} ·{" "}
                        {formatCurrency(item.unit_price)} each
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={maxQty}
                      step={1}
                      disabled={maxQty === 0}
                      aria-label={`Return quantity for ${item.product_title}`}
                      value={value}
                      onChange={event => {
                        const parsed = Math.max(
                          0,
                          Math.min(maxQty, Number.parseInt(event.target.value || "0", 10) || 0)
                        );
                        setReturnQuantities(current => ({
                          ...current,
                          [item.id]: parsed
                        }));
                      }}
                      className="h-10 w-20 text-center"
                    />
                  </div>
                );
              })}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-text">
                Item condition <span className="text-brass">*</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-[2px] border p-3 text-sm ${
                    returnCondition === "resellable"
                      ? "border-brass bg-stone"
                      : "border-border bg-paper"
                  }`}
                >
                  <input
                    type="radio"
                    name="return-condition"
                    value="resellable"
                    checked={returnCondition === "resellable"}
                    onChange={() => setReturnCondition("resellable")}
                    className="mt-1 accent-brass"
                  />
                  <span>
                    <span className="block font-medium text-text">Resellable</span>
                    <span className="text-xs text-muted">
                      Returns items to active stock (return_restock).
                    </span>
                  </span>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-[2px] border p-3 text-sm ${
                    returnCondition === "damaged"
                      ? "border-brass bg-stone"
                      : "border-border bg-paper"
                  }`}
                >
                  <input
                    type="radio"
                    name="return-condition"
                    value="damaged"
                    checked={returnCondition === "damaged"}
                    onChange={() => setReturnCondition("damaged")}
                    className="mt-1 accent-brass"
                  />
                  <span>
                    <span className="block font-medium text-text">Damaged</span>
                    <span className="text-xs text-muted">
                      No restock; logged as damaged_writeoff.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-text">Return note (optional)</span>
              <Textarea
                rows={3}
                placeholder="Reason for return or inspection details..."
                value={returnNote}
                onChange={event => setReturnNote(event.target.value)}
              />
            </label>

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setReturnModalOpen(false)}
                disabled={savingId === selectedOrder.id}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingId === selectedOrder.id}>
                {savingId === selectedOrder.id ? "Recording..." : "Save return"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
