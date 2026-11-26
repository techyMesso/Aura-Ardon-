"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Download,
  Mail,
  MessageCircle,
  MessageSquare,
  RotateCcw,
  Send,
  Settings,
  Smartphone,
  Store
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MESSAGE_TEMPLATE_META,
  type MessageTemplateKey,
  renderTemplatePreview,
  TEMPLATE_PLACEHOLDERS
} from "@/lib/message-templates";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/site";
import type {
  DailySummaryReport,
  StoreMessageTemplates,
  StoreSettings
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type SettingsTab = "templates" | "alerts" | "store";

interface PushSubscriptionSummary {
  id: string;
  endpoint: string;
  user_agent: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface NotificationStatusProps {
  resendConfigured: boolean;
  orderNotifyEmail: string | null;
  vapidConfigured: boolean;
  vapidPublicKey: string | null;
  smsEnvEnabled: boolean;
  smsEnvConfigured: boolean;
  smsSandbox: boolean;
}

interface StoreSettingsHubProps {
  initialSettings: StoreSettings;
  initialSubscriptions: PushSubscriptionSummary[];
  initialDailySummary: DailySummaryReport;
  notifications: NotificationStatusProps;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function resolveTab(raw: string | null): SettingsTab {
  if (raw === "alerts" || raw === "store" || raw === "templates") return raw;
  return "templates";
}

export function StoreSettingsHub({
  initialSettings,
  initialSubscriptions,
  initialDailySummary,
  notifications
}: StoreSettingsHubProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    resolveTab(searchParams.get("tab"))
  );

  // Settings & templates state
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [templates, setTemplates] = useState<StoreMessageTemplates>(
    initialSettings.message_templates
  );
  const [smsEnabled, setSmsEnabled] = useState<boolean>(
    Boolean(initialSettings.sms_notifications_enabled)
  );
  const [saving, setSaving] = useState(false);

  // Store operations form fields
  const [isStoreOpen, setIsStoreOpen] = useState(initialSettings.is_store_open);
  const [holidayBanner, setHolidayBanner] = useState(
    initialSettings.holiday_banner_message
  );
  const [businessHours, setBusinessHours] = useState(initialSettings.business_hours);
  const [sameDayCutoff, setSameDayCutoff] = useState(initialSettings.same_day_cutoff);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(
    String(initialSettings.free_delivery_threshold)
  );
  const [lowStockDefault, setLowStockDefault] = useState(
    String(initialSettings.low_stock_default)
  );
  const [autoCancelHours, setAutoCancelHours] = useState(
    String(initialSettings.pending_auto_cancel_hours)
  );
  const [whatsappNumber, setWhatsappNumber] = useState(initialSettings.whatsapp_number);
  const [businessPhone, setBusinessPhone] = useState(initialSettings.business_phone);
  const [businessEmail, setBusinessEmail] = useState(initialSettings.business_email ?? "");
  const [businessAddress, setBusinessAddress] = useState(
    initialSettings.business_address
  );
  const [kraPin, setKraPin] = useState(initialSettings.kra_pin ?? "");
  const [invoiceFooter, setInvoiceFooter] = useState(initialSettings.invoice_footer);
  const [paymentInstructions, setPaymentInstructions] = useState(
    initialSettings.payment_instructions
  );
  const [instagramUrl, setInstagramUrl] = useState(initialSettings.instagram_url);
  const [tiktokUrl, setTiktokUrl] = useState(initialSettings.tiktok_url);

  // Web Push & PWA state
  const [subscriptions, setSubscriptions] =
    useState<PushSubscriptionSummary[]>(initialSubscriptions);
  const [pushSupported, setPushSupported] = useState(false);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    null
  );

  // Daily summary state
  const [dailySummary, setDailySummary] =
    useState<DailySummaryReport>(initialDailySummary);
  const [sendingSummary, setSendingSummary] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        Boolean((window.navigator as { standalone?: boolean }).standalone));
    setIsStandalonePwa(standalone);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setPushSupported(supported);

    if (supported) {
      navigator.serviceWorker
        .getRegistration("/admin/")
        .then(reg => reg?.pushManager.getSubscription())
        .then(sub => {
          if (sub?.endpoint) {
            setCurrentEndpoint(sub.endpoint);
          }
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  function appendPlaceholder(key: MessageTemplateKey, token: string) {
    setTemplates(current => {
      const existing = current[key] ?? "";
      const separator = existing.length > 0 && !existing.endsWith(" ") ? " " : "";
      return {
        ...current,
        [key]: `${existing}${separator}${token}`
      };
    });
  }

  async function handleSaveTemplates(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_templates: templates })
      });
      const payload = (await response.json()) as {
        settings?: StoreSettings;
        error?: string;
      };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error ?? "Unable to save message templates.");
      }
      setSettings(payload.settings);
      setTemplates(payload.settings.message_templates);
      setSuccess("WhatsApp message templates saved.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save message templates."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSmsFlag(nextValue: boolean) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sms_notifications_enabled: nextValue })
      });
      const payload = (await response.json()) as {
        settings?: StoreSettings;
        error?: string;
      };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error ?? "Unable to update SMS preference.");
      }
      setSettings(payload.settings);
      setSmsEnabled(payload.settings.sms_notifications_enabled);
      setSuccess(
        nextValue
          ? "Optional Africa's Talking customer SMS enabled in store settings."
          : "Optional Africa's Talking customer SMS turned off."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update SMS setting."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStoreOperations(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_store_open: isStoreOpen,
          holiday_banner_message: holidayBanner.trim(),
          business_hours: businessHours.trim(),
          same_day_cutoff: sameDayCutoff.trim(),
          free_delivery_threshold: Number(freeDeliveryThreshold || 0),
          low_stock_default: Number(lowStockDefault || 0),
          pending_auto_cancel_hours: Number(autoCancelHours || 48),
          whatsapp_number: whatsappNumber.trim(),
          business_phone: businessPhone.trim(),
          business_email: businessEmail.trim() || null,
          business_address: businessAddress.trim(),
          kra_pin: kraPin.trim() || null,
          invoice_footer: invoiceFooter.trim(),
          payment_instructions: paymentInstructions.trim(),
          instagram_url: instagramUrl.trim(),
          tiktok_url: tiktokUrl.trim()
        })
      });
      const payload = (await response.json()) as {
        settings?: StoreSettings;
        error?: string;
      };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error ?? "Unable to save store settings.");
      }
      setSettings(payload.settings);
      setSuccess("Store operations settings saved.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save store settings."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEnablePush() {
    if (!pushSupported) {
      setError("This browser does not support Web Push notifications.");
      return;
    }
    if (!notifications.vapidPublicKey) {
      setError(
        "Web Push VAPID keys are not configured on the server yet (NEXT_PUBLIC_VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY)."
      );
      return;
    }

    setPushBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission was not granted in your browser.");
      }

      const registration = await navigator.serviceWorker.register("/admin-sw.js", {
        scope: "/admin/"
      });
      await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(notifications.vapidPublicKey)
        }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Browser returned an incomplete push subscription.");
      }

      const response = await fetch("/api/admin/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth
          },
          userAgent: navigator.userAgent.slice(0, 300)
        })
      });
      const payload = (await response.json()) as {
        subscription?: PushSubscriptionSummary;
        error?: string;
      };

      if (!response.ok || !payload.subscription) {
        throw new Error(payload.error ?? "Unable to save push subscription.");
      }

      setCurrentEndpoint(json.endpoint);
      setSubscriptions(current => {
        const filtered = current.filter(item => item.endpoint !== json.endpoint);
        return [payload.subscription!, ...filtered];
      });
      setSuccess("Push notifications enabled for this device.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to enable push notifications."
      );
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDisablePush() {
    setPushBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration("/admin/");
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? currentEndpoint;

      if (subscription) {
        await subscription.unsubscribe();
      }
      if (endpoint) {
        await fetch("/api/admin/push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint })
        });
        setSubscriptions(current => current.filter(item => item.endpoint !== endpoint));
      }
      setCurrentEndpoint(null);
      setSuccess("Push notifications disabled on this device.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to disable push notifications."
      );
    } finally {
      setPushBusy(false);
    }
  }

  async function handleSendTestPush() {
    setPushBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/push/test", { method: "POST" });
      const payload = (await response.json()) as {
        ok?: boolean;
        result?: { sent: number; failed: number };
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to deliver test push notification.");
      }
      setSuccess(
        `Test push sent to ${payload.result?.sent ?? 1} registered device(s).`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to send test push."
      );
    } finally {
      setPushBusy(false);
    }
  }

  async function handleTriggerDailySummary() {
    setSendingSummary(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/notifications/daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dailySummary.date })
      });
      const payload = (await response.json()) as {
        summary?: DailySummaryReport;
        delivery?: {
          email?: { sent: boolean; skipped?: boolean };
          push?: { sent: number; skipped?: boolean };
        };
        error?: string;
      };
      if (!response.ok || !payload.summary) {
        throw new Error(payload.error ?? "Unable to send daily summary.");
      }
      setDailySummary(payload.summary);
      const emailStatus = payload.delivery?.email?.sent
        ? "email sent"
        : payload.delivery?.email?.skipped
          ? "email skipped (Resend not set)"
          : "email failed";
      const pushStatus =
        (payload.delivery?.push?.sent ?? 0) > 0
          ? `push sent to ${payload.delivery?.push?.sent} device(s)`
          : "push skipped (no active subscriptions/VAPID)";
      setSuccess(`Daily summary for ${payload.summary.date}: ${emailStatus}; ${pushStatus}.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to send daily summary."
      );
    } finally {
      setSendingSummary(false);
    }
  }

  async function handleInstallAdminPwa() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
      setSuccess("Auro Ardon Admin app installation started.");
    }
  }

  const isDeviceSubscribed = Boolean(
    currentEndpoint && subscriptions.some(sub => sub.endpoint === currentEndpoint)
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-brass">Operations Configuration</p>
          <h2 className="font-serif text-3xl text-text">Settings, Templates &amp; Alerts</h2>
          <p className="mt-1 text-sm text-muted">
            Customize WhatsApp customer message templates, manage new-order email &amp; push notifications, preview the 20:00 EAT daily briefing, and configure store hours.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Store settings sections"
          className="flex gap-1.5 overflow-x-auto border-b border-border pb-3"
        >
          {(
            [
              { id: "templates", label: "WhatsApp Templates", Icon: MessageCircle },
              { id: "alerts", label: "Alerts, PWA & Daily Summary", Icon: Bell },
              { id: "store", label: "Store Operations", Icon: Store }
            ] as const
          ).map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveTab(tab.id);
                  setError(null);
                  setSuccess(null);
                }}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[2px] border px-3.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-brass ${
                  active
                    ? "border-brass bg-brass text-ink"
                    : "border-border bg-paper text-muted hover:border-brass/60 hover:text-text"
                }`}
              >
                <tab.Icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </button>
            );
          })}
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
      </div>

      {/* ─── TAB 1: EDITABLE WHATSAPP MESSAGE TEMPLATES ─────── */}
      {activeTab === "templates" ? (
        <form onSubmit={handleSaveTemplates} className="space-y-6">
          <div className="border border-border bg-stone/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
              Supported placeholders
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {TEMPLATE_PLACEHOLDERS.map(item => (
                <span
                  key={item.token}
                  title={item.description}
                  className="inline-flex items-center gap-1.5 rounded-[2px] border border-border bg-paper px-2.5 py-1 text-xs"
                >
                  <code className="font-mono font-semibold text-brass">
                    {item.token}
                  </code>
                  <span className="text-muted">{item.description}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {MESSAGE_TEMPLATE_META.map(meta => {
              const value = templates[meta.key] ?? DEFAULT_MESSAGE_TEMPLATES[meta.key];
              const preview = renderTemplatePreview(meta.key, value, settings);
              return (
                <article
                  key={meta.key}
                  className="flex flex-col justify-between space-y-3 border border-border bg-paper p-5"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-serif text-xl text-text">{meta.label}</h3>
                        <p className="mt-0.5 text-xs text-muted">{meta.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setTemplates(current => ({
                            ...current,
                            [meta.key]: DEFAULT_MESSAGE_TEMPLATES[meta.key]
                          }))
                        }
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-brass"
                        title="Reset template to default"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Reset
                      </button>
                    </div>

                    <Textarea
                      rows={3}
                      required
                      aria-label={`${meta.label} WhatsApp template`}
                      value={value}
                      onChange={event =>
                        setTemplates(current => ({
                          ...current,
                          [meta.key]: event.target.value
                        }))
                      }
                    />

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted">Insert:</span>
                      {meta.suggestedTokens.map(token => (
                        <button
                          key={token}
                          type="button"
                          onClick={() => appendPlaceholder(meta.key, token)}
                          className="rounded-[2px] border border-border bg-stone/60 px-2 py-0.5 font-mono text-[11px] text-text transition hover:border-brass hover:text-brass"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[2px] border border-emerald-500/25 bg-emerald-500/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                      WhatsApp preview
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-text">
                      {preview}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving templates..." : "Save WhatsApp templates"}
            </Button>
          </div>
        </form>
      ) : null}

      {/* ─── TAB 2: ALERTS, ADMIN PWA & 20:00 EAT SUMMARY ───── */}
      {activeTab === "alerts" ? (
        <div className="space-y-6">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Resend Email Alerts */}
            <section className="space-y-3 border border-border bg-paper p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-brass" aria-hidden />
                  <h3 className="font-serif text-2xl text-text">
                    New-order email alerts (Resend)
                  </h3>
                </div>
                <span
                  className={`rounded-[2px] border px-2 py-0.5 text-xs font-semibold ${
                    notifications.resendConfigured
                      ? "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200"
                      : "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200"
                  }`}
                >
                  {notifications.resendConfigured ? "Active" : "Not configured"}
                </span>
              </div>
              <p className="text-sm text-muted">
                Sends an email on every new WhatsApp order and delivers the 20:00 EAT daily briefing. Failed email calls never block or fail customer orders.
              </p>
              {notifications.resendConfigured ? (
                <p className="rounded-[2px] border border-border bg-stone/50 px-3 py-2 text-xs text-text">
                  Delivering alerts to{" "}
                  <strong className="font-mono">{notifications.orderNotifyEmail}</strong>
                </p>
              ) : (
                <p className="rounded-[2px] border border-border bg-stone/50 px-3 py-2 text-xs text-muted">
                  Set <code className="font-mono">RESEND_API_KEY</code> and{" "}
                  <code className="font-mono">ORDER_NOTIFY_EMAIL</code> in Vercel
                  environment variables to activate email alerts.
                </p>
              )}
            </section>

            {/* Admin PWA + Web Push */}
            <section className="space-y-4 border border-border bg-paper p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-brass" aria-hidden />
                  <h3 className="font-serif text-2xl text-text">
                    Admin PWA &amp; Web Push
                  </h3>
                </div>
                <span
                  className={`rounded-[2px] border px-2 py-0.5 text-xs font-semibold ${
                    notifications.vapidConfigured
                      ? "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200"
                      : "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200"
                  }`}
                >
                  {notifications.vapidConfigured
                    ? `${subscriptions.length} device(s)`
                    : "VAPID keys unset"}
                </span>
              </div>
              <p className="text-sm text-muted">
                Install <code className="font-mono">/admin</code> to your phone home screen for instant new-order push alerts scoped to the admin app.
              </p>

              <div className="flex flex-wrap gap-2">
                {installPrompt ? (
                  <Button type="button" variant="secondary" onClick={() => void handleInstallAdminPwa()}>
                    <Download className="mr-2 h-4 w-4" aria-hidden />
                    Install Admin App
                  </Button>
                ) : isStandalonePwa ? (
                  <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Running as installed Admin PWA
                  </span>
                ) : null}

                {isDeviceSubscribed ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pushBusy}
                    onClick={() => void handleDisablePush()}
                  >
                    <BellOff className="mr-2 h-4 w-4" aria-hidden />
                    {pushBusy ? "Updating..." : "Disable on this device"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={pushBusy || !notifications.vapidConfigured || !pushSupported}
                    onClick={() => void handleEnablePush()}
                  >
                    <Bell className="mr-2 h-4 w-4" aria-hidden />
                    {pushBusy ? "Enabling..." : "Enable push on this device"}
                  </Button>
                )}

                {subscriptions.length > 0 && notifications.vapidConfigured ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pushBusy}
                    onClick={() => void handleSendTestPush()}
                  >
                    <Send className="mr-2 h-4 w-4" aria-hidden />
                    Send test push
                  </Button>
                ) : null}
              </div>

              {!notifications.vapidConfigured ? (
                <p className="rounded-[2px] border border-border bg-stone/50 px-3 py-2 text-xs text-muted">
                  Generate VAPID keys with{" "}
                  <code className="font-mono">npx web-push generate-vapid-keys</code> and
                  set <code className="font-mono">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> and{" "}
                  <code className="font-mono">VAPID_PRIVATE_KEY</code> in Vercel.
                </p>
              ) : null}
            </section>
          </div>

          {/* 20:00 EAT Daily Summary Preview & Manual Send */}
          <section className="space-y-4 border border-border bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-brass" aria-hidden />
                  <h3 className="font-serif text-2xl text-text">
                    20:00 EAT Daily Summary ({dailySummary.date})
                  </h3>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Scheduled automatically at 20:00 EAT (<code className="font-mono">0 17 * * *</code> UTC) via{" "}
                  <code className="font-mono">/api/cron/daily-summary</code>.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={sendingSummary}
                onClick={() => void handleTriggerDailySummary()}
              >
                <Send className="mr-2 h-4 w-4" aria-hidden />
                {sendingSummary ? "Sending..." : "Send summary now"}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <article className="border border-border bg-stone/40 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
                  Orders today
                </p>
                <p className="mt-1 font-serif text-2xl text-text">
                  {dailySummary.ordersTodayCount}
                </p>
                <p className="text-xs text-muted">
                  {dailySummary.ordersTodayByStatus.cancelled} cancelled today
                </p>
              </article>

              <article className="border border-border bg-stone/40 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
                  Booked revenue
                </p>
                <p className="mt-1 font-serif text-2xl text-text">
                  {formatCurrency(dailySummary.bookedRevenue)}
                </p>
              </article>

              <article className="border border-border bg-stone/40 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
                  Collected today
                </p>
                <p className="mt-1 font-serif text-2xl text-text">
                  {formatCurrency(dailySummary.collectedRevenue)}
                </p>
                <p className="text-xs text-muted">
                  Cash {formatCurrency(dailySummary.collectedCash)} · M-Pesa{" "}
                  {formatCurrency(dailySummary.collectedMpesa)}
                </p>
              </article>

              <article className="border border-border bg-stone/40 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
                  Pending / To collect
                </p>
                <p className="mt-1 font-serif text-2xl text-text">
                  {formatCurrency(dailySummary.cashStillToCollectTotal)}
                </p>
                <p className="text-xs text-muted">
                  {dailySummary.pendingOrdersCount} pending ·{" "}
                  {dailySummary.cashStillToCollectCount} unpaid active
                </p>
              </article>

              <article className="border border-border bg-stone/40 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
                  Low stock (&le; {dailySummary.lowStockThreshold})
                </p>
                <p className="mt-1 font-serif text-2xl text-text">
                  {dailySummary.lowStockCount}
                </p>
                <p className="text-xs text-muted">
                  {dailySummary.outOfStockCount} out of stock
                </p>
              </article>
            </div>
          </section>

          {/* Optional Africa's Talking Customer SMS */}
          <section className="space-y-4 border border-border bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-brass" aria-hidden />
                <h3 className="font-serif text-2xl text-text">
                  Optional Customer SMS (Africa&apos;s Talking)
                </h3>
              </div>
              <span
                className={`rounded-[2px] border px-2 py-0.5 text-xs font-semibold ${
                  smsEnabled && notifications.smsEnvEnabled && notifications.smsEnvConfigured
                    ? "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200"
                    : "border-border bg-stone text-muted"
                }`}
              >
                {smsEnabled && notifications.smsEnvEnabled && notifications.smsEnvConfigured
                  ? notifications.smsSandbox
                    ? "Active (Sandbox)"
                    : "Active"
                  : "Off by default"}
              </span>
            </div>

            <p className="text-sm text-muted">
              Optional SMS confirmations and delivery updates to Kenyan customer phones via Africa&apos;s Talking. Requires both the server feature flag (<code className="font-mono">AFRICAS_TALKING_SMS_ENABLED=true</code> + credentials) and the store toggle below.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2px] border border-border bg-stone/40 p-4">
              <div>
                <p className="text-sm font-medium text-text">
                  Enable customer SMS updates in store settings
                </p>
                <p className="text-xs text-muted">
                  Server env flag:{" "}
                  <strong>{notifications.smsEnvEnabled ? "Enabled" : "Off"}</strong> · API
                  credentials:{" "}
                  <strong>
                    {notifications.smsEnvConfigured ? "Configured" : "Not set"}
                  </strong>
                </p>
              </div>
              <Button
                type="button"
                variant={smsEnabled ? "secondary" : "default"}
                disabled={saving}
                onClick={() => void handleSaveSmsFlag(!smsEnabled)}
              >
                {smsEnabled ? "Turn SMS off" : "Enable SMS toggle"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {/* ─── TAB 3: STORE OPERATIONS & HOLIDAY MODE ─────────── */}
      {activeTab === "store" ? (
        <form
          onSubmit={handleSaveStoreOperations}
          className="space-y-5 border border-border bg-paper p-5"
        >
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-brass" aria-hidden />
            <h3 className="font-serif text-2xl text-text">Store Operations &amp; Checkout Rules</h3>
          </div>

          <div className="rounded-[2px] border border-border bg-stone/40 p-4 space-y-3">
            <label className="inline-flex items-center gap-2.5 text-sm font-medium text-text">
              <input
                type="checkbox"
                checked={isStoreOpen}
                onChange={event => setIsStoreOpen(event.target.checked)}
                className="h-4 w-4 accent-brass"
              />
              <span>Store is open and accepting new WhatsApp orders</span>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted">
                Holiday / closed banner message (shown on storefront when closed)
              </span>
              <Input
                placeholder="e.g. Closed for Jamhuri Day — reopening tomorrow at 9am EAT."
                value={holidayBanner}
                onChange={event => setHolidayBanner(event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">WhatsApp order number</span>
              <Input
                value={whatsappNumber}
                onChange={event => setWhatsappNumber(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Business phone</span>
              <Input
                value={businessPhone}
                onChange={event => setBusinessPhone(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Business email (optional)</span>
              <Input
                type="email"
                value={businessEmail}
                onChange={event => setBusinessEmail(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Business hours</span>
              <Input
                value={businessHours}
                onChange={event => setBusinessHours(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Same-day cutoff (EAT HH:MM)</span>
              <Input
                value={sameDayCutoff}
                onChange={event => setSameDayCutoff(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">
                Free delivery threshold (KES, 0 = disabled)
              </span>
              <Input
                type="number"
                min="0"
                step="50"
                value={freeDeliveryThreshold}
                onChange={event => setFreeDeliveryThreshold(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Low stock threshold (units)</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={lowStockDefault}
                onChange={event => setLowStockDefault(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">
                Auto-cancel pending orders after (hours)
              </span>
              <Input
                type="number"
                min="1"
                step="1"
                value={autoCancelHours}
                onChange={event => setAutoCancelHours(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">KRA PIN (optional, for invoices)</span>
              <Input
                value={kraPin}
                onChange={event => setKraPin(event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Business address</span>
              <Input
                value={businessAddress}
                onChange={event => setBusinessAddress(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Payment instructions</span>
              <Input
                value={paymentInstructions}
                onChange={event => setPaymentInstructions(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">Instagram URL (leave blank to hide)</span>
              <Input
                value={instagramUrl}
                onChange={event => setInstagramUrl(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-text">TikTok URL (leave blank to hide)</span>
              <Input
                value={tiktokUrl}
                onChange={event => setTiktokUrl(event.target.value)}
              />
            </label>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-text">Invoice footer note</span>
            <Textarea
              rows={2}
              value={invoiceFooter}
              onChange={event => setInvoiceFooter(event.target.value)}
            />
          </label>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving settings..." : "Save store settings"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

