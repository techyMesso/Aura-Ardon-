import {
  formatOrderDisplayNumber,
  isPendingOrderOverdue24h,
  resolveCanonicalOrderStatus
} from "@/lib/admin-orders";
import {
  getAfricasTalkingSmsEnv,
  getResendEnv,
  getWebPushVapidEnv
} from "@/lib/env";
import {
  buildDailyCashupReport,
  toMoneyNumber,
  toNairobiDateIso
} from "@/lib/invoices";
import { logger } from "@/lib/logger";
import { computeOrderAmountToCollect } from "@/lib/riders";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  AdminPushSubscription,
  DailySummaryLowStockItem,
  DailySummaryReport,
  Invoice,
  InvoicePayment,
  Order,
  OrderReturnRecord,
  Product,
  ProductVariant
} from "@/lib/types";
import { formatCurrency, normalizeKenyanPhoneNumber } from "@/lib/utils";

const NOTIFICATION_TIMEOUT_MS = 4000;

export interface EmailSendResult {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  id?: string;
  error?: string;
}

export interface WebPushSendResult {
  sent: number;
  failed: number;
  deactivated: number;
  skipped?: boolean;
  reason?: string;
  errors?: string[];
}

export interface SmsSendResult {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Sends a transactional email via Resend REST API.
 * Silently skips if RESEND_API_KEY or ORDER_NOTIFY_EMAIL is not configured.
 * Never throws.
 */
export async function sendResendEmail(params: {
  subject: string;
  html: string;
  text: string;
  to?: string;
}): Promise<EmailSendResult> {
  const env = getResendEnv();
  if (!env) {
    return { sent: false, skipped: true, reason: "resend_env_not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.fromEmail,
        to: [params.to ?? env.toEmail],
        subject: params.subject,
        html: params.html,
        text: params.text
      }),
      signal: AbortSignal.timeout(NOTIFICATION_TIMEOUT_MS)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      let detail = errText.trim();
      if (detail) {
        try {
          const parsed = JSON.parse(detail) as { message?: string; error?: string };
          detail = parsed.message || parsed.error || detail;
        } catch {
          // Keep plain text error response
        }
      }
      logger.warn("Resend email delivery failed", {
        status: response.status,
        error: errText.slice(0, 300)
      });
      return {
        sent: false,
        error: detail
          ? `Resend HTTP ${response.status}: ${detail.slice(0, 220)}`
          : `Resend HTTP ${response.status}`
      };
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: body.id };
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    logger.warn("Resend email request threw", { error: message });
    return { sent: false, error: message };
  }
}

/**
 * Optional SMS to customers via Africa's Talking REST API.
 * OFF by default — requires BOTH AFRICAS_TALKING_SMS_ENABLED=true AND store_settings.sms_notifications_enabled=true.
 * Never throws.
 */
export async function sendAfricasTalkingSms(params: {
  to: string;
  message: string;
  enabledInStoreSettings: boolean;
}): Promise<SmsSendResult> {
  const env = getAfricasTalkingSmsEnv();
  if (!env.enabledFlag || !params.enabledInStoreSettings) {
    return { sent: false, skipped: true, reason: "sms_feature_disabled" };
  }
  if (!env.configured || !env.apiKey || !env.username) {
    return { sent: false, skipped: true, reason: "africas_talking_env_missing" };
  }

  let normalized: string;
  try {
    normalized = `+${normalizeKenyanPhoneNumber(params.to)}`;
  } catch {
    return { sent: false, skipped: true, reason: "invalid_recipient_phone" };
  }

  const endpoint = env.sandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const form = new URLSearchParams({
    username: env.username,
    to: normalized,
    message: params.message.slice(0, 480)
  });
  if (env.senderId) {
    form.set("from", env.senderId);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apiKey: env.apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString(),
      signal: AbortSignal.timeout(NOTIFICATION_TIMEOUT_MS)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.warn("Africa's Talking SMS delivery failed", {
        status: response.status,
        error: errText.slice(0, 300)
      });
      return { sent: false, error: `Africa's Talking HTTP ${response.status}` };
    }

    return { sent: true };
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    logger.warn("Africa's Talking SMS request threw", { error: message });
    return { sent: false, error: message };
  }
}

/**
 * Sends Web Push notifications to registered admin PWA devices stored in `admin_push_subscriptions`.
 * Automatically deactivates expired (404 / 410) subscriptions.
 * Never throws.
 */
export async function sendAdminWebPush(params: {
  title: string;
  body: string;
  url: string;
  tag?: string;
  userId?: string;
}): Promise<WebPushSendResult> {
  const vapid = getWebPushVapidEnv();
  if (!vapid) {
    return {
      sent: 0,
      failed: 0,
      deactivated: 0,
      skipped: true,
      reason: "vapid_not_configured"
    };
  }

  try {
    const supabase = createAdminSupabaseClient();
    let query = supabase
      .from("admin_push_subscriptions")
      .select("id, user_id, user_email, endpoint, p256dh, auth, active")
      .eq("active", true);

    if (params.userId) {
      query = query.eq("user_id", params.userId);
    }

    const { data, error } = await query;
    if (error) {
      logger.warn("Unable to query admin push subscriptions", {
        error: error.message
      });
      return { sent: 0, failed: 0, deactivated: 0, skipped: true, reason: "query_error" };
    }

    const subscriptions = (data ?? []) as unknown as Array<
      Pick<AdminPushSubscription, "id" | "endpoint" | "p256dh" | "auth">
    >;

    if (subscriptions.length === 0) {
      return {
        sent: 0,
        failed: 0,
        deactivated: 0,
        skipped: true,
        reason: "no_active_subscriptions"
      };
    }

    const webPushModule = await import("web-push");
    const webpush = webPushModule.default ?? webPushModule;
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

    const notificationPayload = JSON.stringify({
      title: params.title,
      body: params.body,
      url: params.url,
      tag: params.tag ?? "auro-ardon-admin",
      icon: "/icon-192"
    });

    let sent = 0;
    let failed = 0;
    let deactivated = 0;
    const errors: string[] = [];
    const nowIso = new Date().toISOString();

    await Promise.allSettled(
      subscriptions.map(async sub => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            },
            notificationPayload,
            { timeout: NOTIFICATION_TIMEOUT_MS }
          );
          sent += 1;
          await supabase
            .from("admin_push_subscriptions")
            .update({ last_used_at: nowIso } as never)
            .eq("id", sub.id);
        } catch (pushError: unknown) {
          failed += 1;
          const statusCode =
            typeof pushError === "object" &&
            pushError !== null &&
            "statusCode" in pushError
              ? Number((pushError as { statusCode?: unknown }).statusCode)
              : 0;
          const rawMessage =
            pushError instanceof Error ? pushError.message : String(pushError);
          if (statusCode === 404 || statusCode === 410) {
            deactivated += 1;
            errors.push(
              `Push subscription expired (HTTP ${statusCode}) and was deactivated.`
            );
            await supabase
              .from("admin_push_subscriptions")
              .update({ active: false } as never)
              .eq("id", sub.id);
          } else {
            errors.push(
              statusCode
                ? `Push HTTP ${statusCode}: ${rawMessage.slice(0, 180)}`
                : rawMessage.slice(0, 180)
            );
            logger.warn("Admin web push delivery failed", {
              subscriptionId: sub.id,
              statusCode: statusCode || undefined,
              error: rawMessage
            });
          }
        }
      })
    );

    return errors.length > 0
      ? { sent, failed, deactivated, errors }
      : { sent, failed, deactivated };
  } catch (caughtError) {
    const rawMessage =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    logger.warn("Admin web push dispatch failed", {
      error: rawMessage
    });
    return { sent: 0, failed: 1, deactivated: 0, errors: [rawMessage] };
  }
}

export interface NewOrderNotificationInput {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryZoneName: string;
  deliveryAddress: string;
  townCounty?: string | null;
  subtotal: number;
  discountCode?: string | null;
  discountAmount: number;
  shippingFee: number;
  total: number;
  isGift?: boolean;
  giftNote?: string | null;
  notes?: string | null;
  items: Array<{ title: string; quantity: number; lineTotal: number }>;
  trackUrl: string;
  smsNotificationsEnabled?: boolean;
}

/**
 * Dispatches all non-blocking new-order notifications (Resend email + Admin Web Push + optional SMS).
 * Guaranteed never to throw or block order placement.
 */
export async function notifyNewOrder(
  input: NewOrderNotificationInput
): Promise<{
  email: EmailSendResult;
  push: WebPushSendResult;
  sms: SmsSendResult;
}> {
  const adminOrderUrl = `${SITE_URL}/admin/orders?order=${encodeURIComponent(input.orderId)}`;
  const itemLinesText = input.items
    .map(
      item => `- ${item.quantity} x ${item.title}: ${formatCurrency(item.lineTotal)}`
    )
    .join("\n");
  const itemRowsHtml = input.items
    .map(
      item =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e0dc;">${escapeHtml(
          item.title
        )}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e0dc;text-align:center;">${
          item.quantity
        }</td><td style="padding:6px 8px;border-bottom:1px solid #e5e0dc;text-align:right;">${escapeHtml(
          formatCurrency(item.lineTotal)
        )}</td></tr>`
    )
    .join("");

  const subject = `New order ${input.orderNumber} — ${formatCurrency(input.total)} (${input.customerName})`;
  const text = [
    `${SITE_NAME} — New WhatsApp Order`,
    `Order: ${input.orderNumber}`,
    `Customer: ${input.customerName} (${input.customerPhone})`,
    `Delivery: ${input.deliveryZoneName} — ${input.deliveryAddress}${
      input.townCounty ? ` (${input.townCounty})` : ""
    }`,
    "",
    "Items:",
    itemLinesText || "(none)",
    "",
    `Subtotal: ${formatCurrency(input.subtotal)}`,
    ...(input.discountAmount > 0
      ? [
          `Discount${input.discountCode ? ` (${input.discountCode})` : ""}: -${formatCurrency(
            input.discountAmount
          )}`
        ]
      : []),
    `Delivery: ${input.shippingFee === 0 ? "Free" : formatCurrency(input.shippingFee)}`,
    `Total payable on delivery: ${formatCurrency(input.total)}`,
    ...(input.isGift ? [`Gift order${input.giftNote ? `: ${input.giftNote}` : ""}`] : []),
    ...(input.notes ? [`Notes: ${input.notes}`] : []),
    "",
    `Open in admin: ${adminOrderUrl}`
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#1A1216;max-width:600px;margin:0 auto;padding:20px;">
      <p style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B8923E;margin:0;">${escapeHtml(
        SITE_NAME
      )}</p>
      <h1 style="font-family:Georgia,serif;font-size:24px;margin:6px 0 12px;">New order ${escapeHtml(
        input.orderNumber
      )}</h1>
      <p style="margin:0 0 12px;font-size:14px;">
        <strong>${escapeHtml(input.customerName)}</strong> (${escapeHtml(input.customerPhone)})<br/>
        ${escapeHtml(input.deliveryZoneName)} — ${escapeHtml(input.deliveryAddress)}${
          input.townCounty ? ` (${escapeHtml(input.townCounty)})` : ""
        }
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0;">
        <thead>
          <tr style="background:#EFEBE7;text-align:left;">
            <th style="padding:8px;">Item</th>
            <th style="padding:8px;text-align:center;">Qty</th>
            <th style="padding:8px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRowsHtml}</tbody>
      </table>
      <p style="font-size:14px;margin:12px 0;">
        <strong>Total payable on delivery: ${escapeHtml(formatCurrency(input.total))}</strong>
      </p>
      ${
        input.isGift
          ? `<p style="font-size:13px;color:#555;">Gift order${
              input.giftNote ? `: ${escapeHtml(input.giftNote)}` : ""
            }</p>`
          : ""
      }
      ${
        input.notes
          ? `<p style="font-size:13px;color:#555;">Note: ${escapeHtml(input.notes)}</p>`
          : ""
      }
      <p style="margin-top:20px;">
        <a href="${escapeHtml(
          adminOrderUrl
        )}" style="display:inline-block;background:#1A1216;color:#FFFFFF;text-decoration:none;padding:10px 18px;font-size:13px;font-weight:600;">Open order in Admin</a>
      </p>
    </div>
  `.trim();

  const smsText = `${SITE_NAME}: Order ${input.orderNumber} (${formatCurrency(
    input.total
  )}) received. Pay cash or M-Pesa on delivery. Track: ${input.trackUrl}`;

  const [emailRes, pushRes, smsRes] = await Promise.allSettled([
    sendResendEmail({ subject, html, text }),
    sendAdminWebPush({
      title: `New order ${input.orderNumber} (${formatCurrency(input.total)})`,
      body: `${input.customerName} · ${input.deliveryZoneName} · ${input.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      )} item(s)`,
      url: `/admin/orders?order=${encodeURIComponent(input.orderId)}`,
      tag: `new-order-${input.orderNumber}`
    }),
    sendAfricasTalkingSms({
      to: input.customerPhone,
      message: smsText,
      enabledInStoreSettings: Boolean(input.smsNotificationsEnabled)
    })
  ]);

  return {
    email:
      emailRes.status === "fulfilled"
        ? emailRes.value
        : { sent: false, error: "email_unhandled_rejection" },
    push:
      pushRes.status === "fulfilled"
        ? pushRes.value
        : { sent: 0, failed: 1, deactivated: 0 },
    sms:
      smsRes.status === "fulfilled"
        ? smsRes.value
        : { sent: false, error: "sms_unhandled_rejection" }
  };
}

/**
 * Pure builder for the 20:00 EAT daily operations summary.
 */
export function buildDailySummaryReport(
  dateIso: string,
  data: {
    orders: Order[];
    invoices: Invoice[];
    payments: InvoicePayment[];
    returns: OrderReturnRecord[];
    products: Pick<Product, "id" | "title" | "stock_quantity" | "status" | "active">[];
    variants?: Pick<
      ProductVariant,
      "id" | "product_id" | "name" | "stock_quantity" | "active"
    >[];
    lowStockThreshold: number;
    nowMs?: number;
  }
): DailySummaryReport {
  const nowMs = data.nowMs ?? Date.now();
  const invoiceByOrderId = new Map(data.invoices.map(inv => [inv.order_id, inv]));

  const ordersTodayByStatus = {
    pending: 0,
    confirmed: 0,
    dispatched: 0,
    delivered: 0,
    cancelled: 0,
    returned: 0
  };

  let ordersTodayCount = 0;
  let bookedRevenue = 0;
  let pendingOrdersCount = 0;
  let pendingOrdersTotal = 0;
  let overduePending24hCount = 0;
  let cashStillToCollectCount = 0;
  let cashStillToCollectTotal = 0;

  for (const order of data.orders) {
    const status = resolveCanonicalOrderStatus(order);
    const createdDay = toNairobiDateIso(order.created_at);
    const total = toMoneyNumber(order.total);

    if (createdDay === dateIso) {
      ordersTodayByStatus[status] += 1;
      if (status !== "cancelled") {
        ordersTodayCount += 1;
        bookedRevenue = round2(bookedRevenue + total);
      }
    }

    if (status === "pending") {
      pendingOrdersCount += 1;
      pendingOrdersTotal = round2(pendingOrdersTotal + total);
      if (isPendingOrderOverdue24h(order, nowMs)) {
        overduePending24hCount += 1;
      }
    }

    if (status === "dispatched" || status === "delivered") {
      const balanceDue = computeOrderAmountToCollect(
        order,
        invoiceByOrderId.get(order.id) ?? null
      );
      if (balanceDue > 0) {
        cashStillToCollectCount += 1;
        cashStillToCollectTotal = round2(cashStillToCollectTotal + balanceDue);
      }
    }
  }

  for (const ret of data.returns) {
    if (toNairobiDateIso(ret.created_at) === dateIso) {
      bookedRevenue = round2(Math.max(0, bookedRevenue - toMoneyNumber(ret.refund_amount)));
    }
  }

  const cashup = buildDailyCashupReport(
    dateIso,
    data.orders,
    data.invoices,
    data.payments
  );

  // Low stock across active products (or active variants if a product has variants)
  const activeVariantsByProduct = new Map<
    string,
    Array<Pick<ProductVariant, "id" | "product_id" | "name" | "stock_quantity" | "active">>
  >();
  for (const variant of data.variants ?? []) {
    if (!variant.active) continue;
    const list = activeVariantsByProduct.get(variant.product_id) ?? [];
    list.push(variant);
    activeVariantsByProduct.set(variant.product_id, list);
  }

  const threshold = Math.max(0, Math.floor(data.lowStockThreshold));
  const lowStockItems: DailySummaryLowStockItem[] = [];
  let outOfStockCount = 0;

  for (const product of data.products) {
    const isActive =
      product.status !== undefined ? product.status === "active" : Boolean(product.active);
    if (!isActive) continue;

    const productVariants = activeVariantsByProduct.get(product.id);
    if (productVariants && productVariants.length > 0) {
      for (const variant of productVariants) {
        if (variant.stock_quantity <= threshold) {
          if (variant.stock_quantity <= 0) outOfStockCount += 1;
          lowStockItems.push({
            productId: product.id,
            variantId: variant.id,
            title: `${product.title} (${variant.name})`,
            stockQuantity: variant.stock_quantity
          });
        }
      }
    } else if (product.stock_quantity <= threshold) {
      if (product.stock_quantity <= 0) outOfStockCount += 1;
      lowStockItems.push({
        productId: product.id,
        variantId: null,
        title: product.title,
        stockQuantity: product.stock_quantity
      });
    }
  }

  lowStockItems.sort(
    (a, b) => a.stockQuantity - b.stockQuantity || a.title.localeCompare(b.title)
  );

  return {
    date: dateIso,
    ordersTodayCount,
    ordersTodayByStatus,
    bookedRevenue,
    collectedRevenue: cashup.collectedTotal,
    collectedCash: cashup.cashTotal,
    collectedMpesa: cashup.mpesaTotal,
    pendingOrdersCount,
    pendingOrdersTotal,
    overduePending24hCount,
    lowStockThreshold: threshold,
    lowStockCount: lowStockItems.length,
    outOfStockCount,
    lowStockItems: lowStockItems.slice(0, 15),
    cashStillToCollectCount,
    cashStillToCollectTotal
  };
}

export function formatDailySummaryEmail(summary: DailySummaryReport): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `${SITE_NAME} Daily Summary (${summary.date}) — ${summary.ordersTodayCount} order(s), ${formatCurrency(
    summary.collectedRevenue
  )} collected`;

  const lowStockText =
    summary.lowStockItems.length > 0
      ? summary.lowStockItems
          .map(item => `- ${item.title}: ${item.stockQuantity} left`)
          .join("\n")
      : "- All active pieces are above the low-stock threshold.";

  const text = [
    `${SITE_NAME} — 20:00 EAT Daily Summary (${summary.date})`,
    "",
    `Orders today (non-cancelled): ${summary.ordersTodayCount} (Cancelled today: ${summary.ordersTodayByStatus.cancelled})`,
    `Booked revenue today: ${formatCurrency(summary.bookedRevenue)}`,
    `Collected revenue today: ${formatCurrency(summary.collectedRevenue)} (Cash: ${formatCurrency(
      summary.collectedCash
    )}, M-Pesa: ${formatCurrency(summary.collectedMpesa)})`,
    `Pending orders awaiting confirmation: ${summary.pendingOrdersCount} (${formatCurrency(
      summary.pendingOrdersTotal
    )}${summary.overduePending24hCount > 0 ? `, ${summary.overduePending24hCount} overdue >24h` : ""})`,
    `Cash still to collect (dispatched/delivered): ${formatCurrency(
      summary.cashStillToCollectTotal
    )} across ${summary.cashStillToCollectCount} order(s)`,
    `Low stock items (<= ${summary.lowStockThreshold}): ${summary.lowStockCount} (${summary.outOfStockCount} sold out)`,
    "",
    "Low stock breakdown:",
    lowStockText,
    "",
    `Admin dashboard: ${SITE_URL}/admin`
  ].join("\n");

  const lowStockHtml =
    summary.lowStockItems.length > 0
      ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;">${summary.lowStockItems
          .map(
            item =>
              `<li>${escapeHtml(item.title)} — <strong>${item.stockQuantity} left</strong></li>`
          )
          .join("")}</ul>`
      : `<p style="font-size:13px;color:#555;margin:8px 0 0;">All active pieces are healthy above ${summary.lowStockThreshold} units.</p>`;

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#1A1216;max-width:620px;margin:0 auto;padding:20px;">
      <p style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B8923E;margin:0;">${escapeHtml(
        SITE_NAME
      )} · 20:00 EAT BRIEFING</p>
      <h1 style="font-family:Georgia,serif;font-size:24px;margin:6px 0 16px;">Daily Summary — ${escapeHtml(
        summary.date
      )}</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e5e0dc;">
        <tbody>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e0dc;background:#EFEBE7;"><strong>Orders today</strong></td><td style="padding:10px 12px;border-bottom:1px solid #e5e0dc;text-align:right;">${
            summary.ordersTodayCount
          } active (${summary.ordersTodayByStatus.cancelled} cancelled)</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e0dc;background:#EFEBE7;"><strong>Booked revenue</strong></td><td style="padding:10px 12px;border-bottom:1px solid #e5e0dc;text-align:right;">${escapeHtml(
            formatCurrency(summary.bookedRevenue)
          )}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e0dc;background:#EFEBE7;"><strong>Collected revenue</strong></td><td style="padding:10px 12px;border-bottom:1px solid #e5e0dc;text-align:right;"><strong>${escapeHtml(
            formatCurrency(summary.collectedRevenue)
          )}</strong> (Cash ${escapeHtml(formatCurrency(summary.collectedCash))} · M-Pesa ${escapeHtml(
            formatCurrency(summary.collectedMpesa)
          )})</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e0dc;background:#EFEBE7;"><strong>Pending orders</strong></td><td style="padding:10px 12px;border-bottom:1px solid #e5e0dc;text-align:right;">${
            summary.pendingOrdersCount
          } (${escapeHtml(formatCurrency(summary.pendingOrdersTotal))}${
            summary.overduePending24hCount > 0
              ? ` · ${summary.overduePending24hCount} &gt;24h`
              : ""
          })</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e5e0dc;background:#EFEBE7;"><strong>Cash still to collect</strong></td><td style="padding:10px 12px;border-bottom:1px solid #e5e0dc;text-align:right;"><strong>${escapeHtml(
            formatCurrency(summary.cashStillToCollectTotal)
          )}</strong> (${summary.cashStillToCollectCount} order(s))</td></tr>
          <tr><td style="padding:10px 12px;background:#EFEBE7;"><strong>Low stock (&le; ${
            summary.lowStockThreshold
          })</strong></td><td style="padding:10px 12px;text-align:right;">${
            summary.lowStockCount
          } item(s) (${summary.outOfStockCount} out of stock)</td></tr>
        </tbody>
      </table>
      <h2 style="font-family:Georgia,serif;font-size:18px;margin:18px 0 4px;">Low stock watch</h2>
      ${lowStockHtml}
      <p style="margin-top:20px;">
        <a href="${escapeHtml(
          `${SITE_URL}/admin`
        )}" style="display:inline-block;background:#1A1216;color:#FFFFFF;text-decoration:none;padding:10px 18px;font-size:13px;font-weight:600;">Open Admin Dashboard</a>
      </p>
    </div>
  `.trim();

  return { subject, text, html };
}

export async function sendDailySummaryNotifications(
  summary: DailySummaryReport
): Promise<{
  email: EmailSendResult;
  push: WebPushSendResult;
}> {
  const emailContent = formatDailySummaryEmail(summary);
  const [emailRes, pushRes] = await Promise.allSettled([
    sendResendEmail(emailContent),
    sendAdminWebPush({
      title: `Daily Summary (${summary.date})`,
      body: `${summary.ordersTodayCount} orders · ${formatCurrency(
        summary.collectedRevenue
      )} collected · ${formatCurrency(summary.cashStillToCollectTotal)} to collect · ${
        summary.pendingOrdersCount
      } pending`,
      url: "/admin/invoices",
      tag: `daily-summary-${summary.date}`
    })
  ]);

  return {
    email:
      emailRes.status === "fulfilled"
        ? emailRes.value
        : { sent: false, error: "email_unhandled_rejection" },
    push:
      pushRes.status === "fulfilled"
        ? pushRes.value
        : { sent: 0, failed: 1, deactivated: 0 }
  };
}

export interface TestAlertEmailChannelResult {
  configured: boolean;
  toEmail: string | null;
  sent: boolean;
  skipped: boolean;
  id?: string;
  error?: string;
}

export interface TestAlertPushChannelResult {
  configured: boolean;
  deviceCount: number;
  sent: number;
  failed: number;
  deactivated: number;
  skipped: boolean;
  error?: string;
  errors?: string[];
}

export interface TestAdminAlertResult {
  ok: boolean;
  email: TestAlertEmailChannelResult;
  push: TestAlertPushChannelResult;
}

/**
 * Sends a test alert across configured notification channels (Resend email and/or Admin Web Push)
 * and reports per-channel success or exact failure reasons.
 */
export async function sendAdminTestAlert(params?: {
  actorEmail?: string | null;
}): Promise<TestAdminAlertResult> {
  const resendEnv = getResendEnv();
  const vapidEnv = getWebPushVapidEnv();
  const triggeredBy = params?.actorEmail?.trim() || "store owner";
  const timestamp = new Date().toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short"
  });

  const emailPromise: Promise<TestAlertEmailChannelResult> = resendEnv
    ? sendResendEmail({
        subject: `Test alert — ${SITE_NAME} order notifications`,
        text: [
          `${SITE_NAME} — Test Alert`,
          "",
          `Triggered by: ${triggeredBy}`,
          `Time (EAT): ${timestamp}`,
          "",
          "If you received this email, new-order email alerts are working.",
          `Settings: ${SITE_URL}/admin/settings?tab=alerts`
        ].join("\n"),
        html: `
          <div style="font-family:system-ui,-apple-system,sans-serif;color:#1A1216;max-width:560px;margin:0 auto;padding:20px;">
            <p style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#B8923E;margin:0;">${escapeHtml(
              SITE_NAME
            )} · TEST ALERT</p>
            <h1 style="font-family:Georgia,serif;font-size:22px;margin:8px 0 12px;">Order email alerts are working</h1>
            <p style="font-size:14px;line-height:1.5;margin:0 0 12px;">
              This test alert was triggered by <strong>${escapeHtml(
                triggeredBy
              )}</strong> on ${escapeHtml(timestamp)} EAT.
            </p>
            <p style="margin-top:16px;">
              <a href="${escapeHtml(
                `${SITE_URL}/admin/settings?tab=alerts`
              )}" style="display:inline-block;background:#1A1216;color:#FFFFFF;text-decoration:none;padding:10px 16px;font-size:13px;font-weight:600;">Open Alert Settings</a>
            </p>
          </div>
        `.trim()
      }).then(res => ({
        configured: true,
        toEmail: resendEnv.toEmail,
        sent: res.sent,
        skipped: Boolean(res.skipped),
        id: res.id,
        error: res.error
      }))
    : Promise.resolve({
        configured: false,
        toEmail: null,
        sent: false,
        skipped: true,
        error:
          "Email alerts are not configured (set RESEND_API_KEY and ORDER_NOTIFY_EMAIL)."
      });

  const pushPromise: Promise<TestAlertPushChannelResult> = vapidEnv
    ? sendAdminWebPush({
        title: `${SITE_NAME} — Test Alert`,
        body: `Push notifications are active (${timestamp} EAT).`,
        url: "/admin/settings?tab=alerts",
        tag: `admin-test-alert-${Date.now()}`
      }).then(res => {
        const deviceCount = res.sent + res.failed;
        let error: string | undefined;
        if (res.skipped && res.reason === "no_active_subscriptions") {
          error =
            "No subscribed push devices yet. Install the Admin PWA and tap 'Enable push on this device' on your phone.";
        } else if (res.skipped && res.reason === "query_error") {
          error = "Unable to read subscribed push devices from the database.";
        } else if (res.sent === 0 && res.failed > 0) {
          error =
            res.errors?.[0] ?? "Web push delivery failed for all subscribed devices.";
        }
        return {
          configured: true,
          deviceCount,
          sent: res.sent,
          failed: res.failed,
          deactivated: res.deactivated,
          skipped: Boolean(res.skipped),
          error,
          errors: res.errors
        };
      })
    : Promise.resolve({
        configured: false,
        deviceCount: 0,
        sent: 0,
        failed: 0,
        deactivated: 0,
        skipped: true,
        error:
          "Web Push is not configured (set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)."
      });

  const [email, push] = await Promise.all([emailPromise, pushPromise]);

  return {
    ok: email.sent || push.sent > 0,
    email,
    push
  };
}

/**
 * Helper to format an order display number safely for notifications.
 */
export function getOrderSummaryLabel(order: Pick<Order, "id" | "order_number">): string {
  return formatOrderDisplayNumber(order);
}

