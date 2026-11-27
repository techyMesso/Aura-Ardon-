export interface AlertHealthStatus {
  hasActiveChannel: boolean;
  resendConfigured: boolean;
  vapidConfigured: boolean;
  activePushDevices: number;
}

export const ALERT_HEALTH_WARNING_TEXT =
  "You won't be notified about new orders. Set up email alerts or enable push on your phone.";

export const ALERT_HEALTH_DISMISS_STORAGE_KEY = "aa_alert_health_dismissed_date";

/**
 * A notification channel is active when Resend email alerts are configured
 * OR at least one push device is actively subscribed (with VAPID configured).
 */
export function evaluateAlertHealth(input: {
  resendConfigured: boolean;
  vapidConfigured: boolean;
  activePushDevices: number;
}): AlertHealthStatus {
  const activePushDevices = Math.max(0, Math.floor(input.activePushDevices || 0));
  const pushActive = input.vapidConfigured && activePushDevices > 0;
  return {
    hasActiveChannel: Boolean(input.resendConfigured) || pushActive,
    resendConfigured: Boolean(input.resendConfigured),
    vapidConfigured: Boolean(input.vapidConfigured),
    activePushDevices
  };
}

/**
 * Returns the current date string (YYYY-MM-DD) in East Africa Time (Africa/Nairobi).
 */
export function getNairobiDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find(p => p.type === "year")?.value ?? "1970";
  const month = parts.find(p => p.type === "month")?.value ?? "01";
  const day = parts.find(p => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function isAlertHealthDismissedForToday(
  storedDismissDate: string | null | undefined,
  todayNairobiIso: string
): boolean {
  if (!storedDismissDate) return false;
  return storedDismissDate.trim() === todayNairobiIso.trim();
}

