import { TIMEZONE } from "@/lib/site";

export interface DeliveryEstimateInput {
  now?: Date;
  sameDayCutoff: string; // "HH:MM" in EAT, e.g. "14:00"
  businessHours?: string;
  isStoreOpen?: boolean;
  holidayBannerMessage?: string;
}

export interface DeliveryEstimateResult {
  headline: string;
  subline: string;
  isSameDay: boolean;
}

function getNairobiClock(date: Date): {
  weekday: string;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const weekday = parts.find(p => p.type === "weekday")?.value ?? "Mon";
  const rawHour = Number(parts.find(p => p.type === "hour")?.value ?? "9");
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find(p => p.type === "minute")?.value ?? "0");

  return { weekday, hour, minute };
}

function parseCutoffMinutes(cutoff: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(cutoff.trim());
  if (!match) return 14 * 60;
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return hours * 60 + minutes;
}

/**
 * Computes a live Nairobi same-day / next-day delivery estimate relative to
 * the configured EAT cutoff (default 14:00 Africa/Nairobi).
 */
export function computeDeliveryEstimate({
  now = new Date(),
  sameDayCutoff,
  isStoreOpen = true,
  holidayBannerMessage = ""
}: DeliveryEstimateInput): DeliveryEstimateResult {
  if (!isStoreOpen) {
    return {
      headline:
        holidayBannerMessage.trim() ||
        "Our studio is currently closed for orders. Delivery resumes when we reopen.",
      subline: "You can browse and save pieces to your wishlist anytime.",
      isSameDay: false
    };
  }

  const { weekday, hour, minute } = getNairobiClock(now);
  const currentMinutes = hour * 60 + minute;
  const cutoffMinutes = parseCutoffMinutes(sameDayCutoff);
  const isSunday = weekday === "Sun";
  const isSaturday = weekday === "Sat";

  if (!isSunday && currentMinutes < cutoffMinutes) {
    const remaining = cutoffMinutes - currentMinutes;
    const hoursLeft = Math.floor(remaining / 60);
    const minutesLeft = remaining % 60;
    const windowText =
      hoursLeft > 0
        ? minutesLeft > 0
          ? `${hoursLeft}h ${minutesLeft}m`
          : `${hoursLeft}h`
        : `${Math.max(1, minutesLeft)}m`;

    return {
      headline: `Order in ${windowText} for same-day delivery in Nairobi.`,
      subline: "1–2 business days via courier outside Nairobi. Pay cash or M-Pesa on delivery.",
      isSameDay: true
    };
  }

  if (isSunday || isSaturday) {
    return {
      headline: "Order now for Monday delivery in Nairobi.",
      subline: "1–2 business days via courier outside Nairobi. Pay cash or M-Pesa on delivery.",
      isSameDay: false
    };
  }

  return {
    headline: "Order now for next-day delivery in Nairobi.",
    subline: "1–2 business days via courier outside Nairobi. Pay cash or M-Pesa on delivery.",
    isSameDay: false
  };
}

