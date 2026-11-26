import { describe, expect, it } from "vitest";

import {
  buildCsvContent,
  buildEmptyAnalyticsDashboardReport,
  computePercentDelta,
  formatHoursDuration,
  isBotUserAgent,
  resolveAnalyticsDateRange
} from "@/lib/analytics";

describe("Phase 11 analytics utilities, EAT date ranges, deltas, CSV, and bot filtering", () => {
  it("resolves Today, 7d, 30d, 90d, This month, and Custom date ranges in Africa/Nairobi time", () => {
    // 2026-05-15T22:30:00Z = 2026-05-16 01:30 EAT!
    const nairobiNextDay = new Date("2026-05-15T22:30:00.000Z");

    expect(resolveAnalyticsDateRange("today", null, null, nairobiNextDay)).toEqual({
      from: "2026-05-16",
      to: "2026-05-16",
      preset: "today"
    });
    expect(resolveAnalyticsDateRange("7d", null, null, nairobiNextDay)).toEqual({
      from: "2026-05-10",
      to: "2026-05-16",
      preset: "7d"
    });
    expect(resolveAnalyticsDateRange("30d", null, null, nairobiNextDay)).toEqual({
      from: "2026-04-17",
      to: "2026-05-16",
      preset: "30d"
    });
    expect(resolveAnalyticsDateRange("90d", null, null, nairobiNextDay)).toEqual({
      from: "2026-02-16",
      to: "2026-05-16",
      preset: "90d"
    });
    expect(resolveAnalyticsDateRange("this_month", null, null, nairobiNextDay)).toEqual({
      from: "2026-05-01",
      to: "2026-05-16",
      preset: "this_month"
    });
    // Swaps inverted custom ranges gracefully
    expect(
      resolveAnalyticsDateRange("custom", "2026-05-20", "2026-05-10", nairobiNextDay)
    ).toEqual({
      from: "2026-05-10",
      to: "2026-05-20",
      preset: "custom"
    });
  });

  it("computes previous-period percentage deltas and formats fulfillment durations", () => {
    expect(computePercentDelta(150, 100)).toEqual({ deltaPct: 50, direction: "up" });
    expect(computePercentDelta(80, 100)).toEqual({ deltaPct: -20, direction: "down" });
    expect(computePercentDelta(0, 0)).toEqual({ deltaPct: 0, direction: "flat" });
    expect(computePercentDelta(2500, 0)).toEqual({ deltaPct: 100, direction: "up" });
    expect(computePercentDelta(null, 100)).toEqual({ deltaPct: null, direction: "na" });

    expect(formatHoursDuration(null)).toBe("—");
    expect(formatHoursDuration(0.5)).toBe("30m");
    expect(formatHoursDuration(4.25)).toBe("4.3h");
    expect(formatHoursDuration(30)).toBe("1d 6h");
  });

  it("escapes CSV cells cleanly and filters bots/crawlers from storefront events", () => {
    const csv = buildCsvContent(
      ["Product", "Revenue (KES)"],
      [['Watch, "Gold" Edition', "2500.00"]]
    );
    expect(csv).toBe('Product,Revenue (KES)\n"Watch, ""Gold"" Edition",2500.00');

    expect(isBotUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUserAgent("HeadlessChrome/125.0")).toBe(true);
    expect(isBotUserAgent("curl/8.4.0")).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
      )
    ).toBe(false);
  });

  it("builds safe zero-data fallback reports respecting owner vs staff boundaries", () => {
    const ownerEmpty = buildEmptyAnalyticsDashboardReport("2026-05-01", "2026-05-30", true);
    const staffEmpty = buildEmptyAnalyticsDashboardReport("2026-05-01", "2026-08-30", false);

    expect(ownerEmpty.range.granularity).toBe("day");
    expect(ownerEmpty.kpis.gross_profit).toBe(0);
    expect(ownerEmpty.inventory.stock_value.cost_value).toBe(0);

    expect(staffEmpty.range.granularity).toBe("week");
    expect(staffEmpty.kpis.gross_profit).toBeNull();
    expect(staffEmpty.inventory.stock_value.cost_value).toBeNull();
  });
});

